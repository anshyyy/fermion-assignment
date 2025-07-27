import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import {
  IUserSession,
  IRoomConfig,
  UserRole,
  ConnectionState,
} from '@/types/webrtc.types';
import { defaultRoomConfig } from '@/config/mediasoup.config';

/**
 * Room Service
 * 
 * This service manages streaming rooms, user sessions, and room state.
 * It follows the Repository pattern to abstract room data management
 * and provides a clean interface for room operations.
 * 
 * Key responsibilities:
 * - Manage room creation and configuration
 * - Handle user session lifecycle within rooms
 * - Track room membership and user roles
 * - Provide room state information
 * - Enforce room capacity limits
 */
@Injectable()
export class RoomService {
  private readonly logger = new Logger(RoomService.name);

  // In-memory storage for rooms and user sessions
  // In production, you would use Redis, MongoDB, or another persistent store
  private rooms: Map<string, IRoomConfig> = new Map();
  private roomUsers: Map<string, Map<string, IUserSession>> = new Map();

  constructor() {
    // Initialize default room
    this.initializeDefaultRoom();
  }

  /**
   * Initialize the default streaming room
   */
  private initializeDefaultRoom(): void {
    const defaultRoom: IRoomConfig = {
      id: 'main-stream',
      name: 'Main Stream',
      maxViewers: defaultRoomConfig.maxViewers,
      allowedOrigins: defaultRoomConfig.allowedOrigins,
      isPrivate: defaultRoomConfig.isPrivate,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.rooms.set(defaultRoom.id, defaultRoom);
    this.roomUsers.set(defaultRoom.id, new Map());

    this.logger.log(`🏠 Initialized default room: ${defaultRoom.id}`);
  }

  /**
   * Create a new room with specified configuration
   */
  async createRoom(
    name: string,
    options: Partial<Omit<IRoomConfig, 'id' | 'name' | 'createdAt' | 'updatedAt'>> = {},
  ): Promise<IRoomConfig> {
    try {
      const roomId = uuidv4();
      const now = new Date();

      const roomConfig: IRoomConfig = {
        id: roomId,
        name,
        maxViewers: options.maxViewers || defaultRoomConfig.maxViewers,
        allowedOrigins: options.allowedOrigins || defaultRoomConfig.allowedOrigins,
        isPrivate: options.isPrivate || defaultRoomConfig.isPrivate,
        streamerId: options.streamerId,
        createdAt: now,
        updatedAt: now,
      };

      // Store room configuration
      this.rooms.set(roomId, roomConfig);
      this.roomUsers.set(roomId, new Map());

      this.logger.log(`🏠 Created new room: ${roomId} (${name})`);
      return roomConfig;

    } catch (error) {
      this.logger.error(`❌ Failed to create room ${name}:`, error);
      throw error;
    }
  }

  /**
   * Get room configuration by ID
   */
  async getRoomInfo(roomId: string): Promise<IRoomConfig | undefined> {
    return this.rooms.get(roomId);
  }

  /**
   * Get all active rooms
   */
  async getAllRooms(): Promise<IRoomConfig[]> {
    return Array.from(this.rooms.values());
  }

  /**
   * Update room configuration
   */
  async updateRoom(
    roomId: string,
    updates: Partial<Omit<IRoomConfig, 'id' | 'createdAt'>>,
  ): Promise<IRoomConfig | undefined> {
    try {
      const room = this.rooms.get(roomId);
      if (!room) {
        this.logger.warn(`Room not found for update: ${roomId}`);
        return undefined;
      }

      const updatedRoom: IRoomConfig = {
        ...room,
        ...updates,
        updatedAt: new Date(),
      };

      this.rooms.set(roomId, updatedRoom);
      this.logger.debug(`📝 Updated room: ${roomId}`);
      
      return updatedRoom;

    } catch (error) {
      this.logger.error(`❌ Failed to update room ${roomId}:`, error);
      throw error;
    }
  }

  /**
   * Delete a room and remove all users
   */
  async deleteRoom(roomId: string): Promise<boolean> {
    try {
      if (roomId === 'main-stream') {
        this.logger.warn('Cannot delete default room');
        return false;
      }

      const room = this.rooms.get(roomId);
      if (!room) {
        this.logger.warn(`Room not found for deletion: ${roomId}`);
        return false;
      }

      // Remove all users from the room
      this.roomUsers.delete(roomId);
      this.rooms.delete(roomId);

      this.logger.log(`🗑️ Deleted room: ${roomId}`);
      return true;

    } catch (error) {
      this.logger.error(`❌ Failed to delete room ${roomId}:`, error);
      throw error;
    }
  }

  /**
   * Add a user to a room
   */
  async addUserToRoom(roomId: string, userSession: IUserSession): Promise<void> {
    try {
      // Ensure room exists
      if (!this.rooms.has(roomId)) {
        // Create room if it doesn't exist (for dynamic rooms)
        await this.createRoom(`Room ${roomId}`);
      }

      // Get or create user map for room
      let roomUserMap = this.roomUsers.get(roomId);
      if (!roomUserMap) {
        roomUserMap = new Map();
        this.roomUsers.set(roomId, roomUserMap);
      }

      // Check room capacity for viewers
      if (userSession.role === UserRole.VIEWER) {
        const room = this.rooms.get(roomId);
        const currentViewers = this.getViewerCount(roomId);
        
        if (room && currentViewers >= room.maxViewers) {
          throw new Error('Room is at maximum capacity');
        }
      }

      // Check if room already has a streamer
      if (userSession.role === UserRole.STREAMER && this.hasStreamer(roomId)) {
        throw new Error('Room already has an active streamer');
      }

      // Add user to room
      roomUserMap.set(userSession.id, userSession);

      // Update room's streamer ID if user is a streamer
      if (userSession.role === UserRole.STREAMER) {
        await this.updateRoom(roomId, { streamerId: userSession.id });
      }

      this.logger.debug(`👤 Added user ${userSession.id} to room ${roomId} as ${userSession.role}`);

    } catch (error) {
      this.logger.error(`❌ Failed to add user ${userSession.id} to room ${roomId}:`, error);
      throw error;
    }
  }

  /**
   * Remove a user from a room
   */
  async removeUserFromRoom(roomId: string, userId: string): Promise<void> {
    try {
      const roomUserMap = this.roomUsers.get(roomId);
      if (!roomUserMap) {
        this.logger.warn(`Room not found: ${roomId}`);
        return;
      }

      const userSession = roomUserMap.get(userId);
      if (!userSession) {
        this.logger.warn(`User not found in room: ${userId}`);
        return;
      }

      // Remove user from room
      roomUserMap.delete(userId);

      // If user was the streamer, clear streamer ID from room
      if (userSession.role === UserRole.STREAMER) {
        await this.updateRoom(roomId, { streamerId: undefined });
      }

      this.logger.debug(`👤 Removed user ${userId} from room ${roomId}`);

    } catch (error) {
      this.logger.error(`❌ Failed to remove user ${userId} from room ${roomId}:`, error);
      throw error;
    }
  }

  /**
   * Get a user session from a room
   */
  async getUserSession(roomId: string, userId: string): Promise<IUserSession | undefined> {
    const roomUserMap = this.roomUsers.get(roomId);
    return roomUserMap?.get(userId);
  }

  /**
   * Update a user session in a room
   */
  async updateUserSession(roomId: string, userSession: IUserSession): Promise<void> {
    try {
      const roomUserMap = this.roomUsers.get(roomId);
      if (!roomUserMap) {
        throw new Error(`Room not found: ${roomId}`);
      }

      // Update last activity timestamp
      userSession.lastActivity = new Date();

      // Store updated session
      roomUserMap.set(userSession.id, userSession);

      this.logger.debug(`📝 Updated user session ${userSession.id} in room ${roomId}`);

    } catch (error) {
      this.logger.error(`❌ Failed to update user session ${userSession.id}:`, error);
      throw error;
    }
  }

  /**
   * Get all users in a room
   */
  async getRoomUsers(roomId: string): Promise<IUserSession[]> {
    const roomUserMap = this.roomUsers.get(roomId);
    return roomUserMap ? Array.from(roomUserMap.values()) : [];
  }

  /**
   * Get room state (room info + users)
   */
  async getRoomState(roomId: string): Promise<{
    room: IRoomConfig | undefined;
    users: IUserSession[];
    viewerCount: number;
    hasActiveStreamer: boolean;
  }> {
    const room = await this.getRoomInfo(roomId);
    const users = await this.getRoomUsers(roomId);
    const viewerCount = this.getViewerCount(roomId);
    const hasActiveStreamer = this.hasStreamer(roomId);

    return {
      room,
      users,
      viewerCount,
      hasActiveStreamer,
    };
  }

  /**
   * Get viewer count for a room
   */
  getViewerCount(roomId: string): number {
    const roomUserMap = this.roomUsers.get(roomId);
    if (!roomUserMap) return 0;

    let viewerCount = 0;
    for (const user of roomUserMap.values()) {
      if (user.role === UserRole.VIEWER && user.connectionState === ConnectionState.CONNECTED) {
        viewerCount++;
      }
    }

    return viewerCount;
  }

  /**
   * Check if room has an active streamer
   */
  hasStreamer(roomId: string): boolean {
    const roomUserMap = this.roomUsers.get(roomId);
    if (!roomUserMap) return false;

    for (const user of roomUserMap.values()) {
      if (
        user.role === UserRole.STREAMER &&
        user.connectionState === ConnectionState.CONNECTED
      ) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get the active streamer for a room
   */
  getActiveStreamer(roomId: string): IUserSession | undefined {
    const roomUserMap = this.roomUsers.get(roomId);
    if (!roomUserMap) return undefined;

    for (const user of roomUserMap.values()) {
      if (
        user.role === UserRole.STREAMER &&
        user.connectionState === ConnectionState.CONNECTED
      ) {
        return user;
      }
    }

    return undefined;
  }

  /**
   * Get total user count for a room
   */
  getTotalUserCount(roomId: string): number {
    const roomUserMap = this.roomUsers.get(roomId);
    if (!roomUserMap) return 0;

    let activeCount = 0;
    for (const user of roomUserMap.values()) {
      if (user.connectionState === ConnectionState.CONNECTED) {
        activeCount++;
      }
    }

    return activeCount;
  }

  /**
   * Clean up inactive user sessions
   * Should be called periodically to remove stale sessions
   */
  async cleanupInactiveSessions(maxInactiveMinutes: number = 5): Promise<void> {
    try {
      const cutoffTime = new Date(Date.now() - maxInactiveMinutes * 60 * 1000);
      let cleanedCount = 0;

      for (const [roomId, roomUserMap] of this.roomUsers) {
        const usersToRemove: string[] = [];

        for (const [userId, user] of roomUserMap) {
          if (
            user.connectionState !== ConnectionState.CONNECTED ||
            user.lastActivity < cutoffTime
          ) {
            usersToRemove.push(userId);
          }
        }

        // Remove inactive users
        for (const userId of usersToRemove) {
          await this.removeUserFromRoom(roomId, userId);
          cleanedCount++;
        }
      }

      if (cleanedCount > 0) {
        this.logger.log(`🧹 Cleaned up ${cleanedCount} inactive user sessions`);
      }

    } catch (error) {
      this.logger.error('❌ Error during session cleanup:', error);
    }
  }

  /**
   * Get room statistics
   */
  async getRoomStatistics(): Promise<{
    totalRooms: number;
    totalUsers: number;
    totalViewers: number;
    totalStreamers: number;
    activeRooms: number;
  }> {
    let totalUsers = 0;
    let totalViewers = 0;
    let totalStreamers = 0;
    let activeRooms = 0;

    for (const [roomId, roomUserMap] of this.roomUsers) {
      let roomHasActiveUsers = false;

      for (const user of roomUserMap.values()) {
        if (user.connectionState === ConnectionState.CONNECTED) {
          totalUsers++;
          roomHasActiveUsers = true;

          if (user.role === UserRole.VIEWER) {
            totalViewers++;
          } else if (user.role === UserRole.STREAMER) {
            totalStreamers++;
          }
        }
      }

      if (roomHasActiveUsers) {
        activeRooms++;
      }
    }

    return {
      totalRooms: this.rooms.size,
      totalUsers,
      totalViewers,
      totalStreamers,
      activeRooms,
    };
  }

  /**
   * Log room service statistics
   */
  async logStatistics(): Promise<void> {
    const stats = await this.getRoomStatistics();
    
    this.logger.log('📊 Room Service Statistics:');
    this.logger.log(`   Total Rooms: ${stats.totalRooms}`);
    this.logger.log(`   Active Rooms: ${stats.activeRooms}`);
    this.logger.log(`   Total Users: ${stats.totalUsers}`);
    this.logger.log(`   Viewers: ${stats.totalViewers}`);
    this.logger.log(`   Streamers: ${stats.totalStreamers}`);
  }
} 