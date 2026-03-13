import { describe, it, expect, beforeEach } from 'vitest';
import { useNotificationStore } from '@/lib/stores/notification-store';

beforeEach(() => {
  useNotificationStore.setState({ unreadCount: 0 });
});

describe('useNotificationStore', () => {
  it('has default unreadCount of 0', () => {
    expect(useNotificationStore.getState().unreadCount).toBe(0);
  });

  it('setUnreadCount sets the value', () => {
    useNotificationStore.getState().setUnreadCount(5);
    expect(useNotificationStore.getState().unreadCount).toBe(5);
  });

  it('incrementUnread increases by 1', () => {
    useNotificationStore.getState().setUnreadCount(3);
    useNotificationStore.getState().incrementUnread();
    expect(useNotificationStore.getState().unreadCount).toBe(4);
  });

  it('decrementUnread decreases by 1', () => {
    useNotificationStore.getState().setUnreadCount(3);
    useNotificationStore.getState().decrementUnread();
    expect(useNotificationStore.getState().unreadCount).toBe(2);
  });

  it('decrementUnread never goes below 0', () => {
    useNotificationStore.getState().setUnreadCount(0);
    useNotificationStore.getState().decrementUnread();
    expect(useNotificationStore.getState().unreadCount).toBe(0);
  });

  it('multiple increments stack correctly', () => {
    useNotificationStore.getState().incrementUnread();
    useNotificationStore.getState().incrementUnread();
    useNotificationStore.getState().incrementUnread();
    expect(useNotificationStore.getState().unreadCount).toBe(3);
  });
});
