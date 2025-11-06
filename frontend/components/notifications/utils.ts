import { formatDistanceToNow } from "date-fns";

import type { NotificationActor, NotificationRecord } from "@/lib/notifications";

const FALLBACK_TITLE = "New activity";
const FALLBACK_MESSAGE = "We will let you know when there is more to see.";

function getActorName(actor?: NotificationActor | null): string | null {
  if (!actor) {
    return null;
  }
  if (actor.display_name) {
    return actor.display_name;
  }
  if (actor.handle) {
    return `@${actor.handle}`;
  }
  return null;
}

export function buildNotificationTitle(notification: NotificationRecord): string {
  if (notification.title?.trim()) {
    return notification.title.trim();
  }

  const actorName = getActorName(notification.actor);
  if (notification.verb && actorName) {
    return `${actorName} ${notification.verb}`;
  }
  if (notification.verb) {
    return notification.verb;
  }
  if (actorName) {
    switch (notification.entity.type) {
      case "post.comment":
        return `${actorName} left a comment`;
      case "post.reaction":
        return `${actorName} reacted to your post`;
      case "post.created":
        return `${actorName} shared a new post`;
      case "event.rsvp.promoted":
        return `${actorName} is attending an event`;
      case "social.invite.received":
        return `${actorName} sent you an invite`;
      default:
        return `${actorName} sent an update`;
    }
  }
  switch (notification.entity.type) {
    case "post.comment":
      return "New comment";
    case "post.reaction":
      return "New reaction";
    case "post.created":
      return "New post";
    case "event.rsvp.promoted":
      return "Event update";
    case "social.invite.received":
      return "New invite";
    default:
      return FALLBACK_TITLE;
  }
}

export function buildNotificationMessage(notification: NotificationRecord): string {
  if (notification.message?.trim()) {
    return notification.message.trim();
  }
  if (notification.verb?.trim()) {
    const actorName = getActorName(notification.actor);
    if (actorName) {
      return `${actorName} ${notification.verb.trim()}`;
    }
    return notification.verb.trim();
  }
  if (notification.entity.type === "social.invite.received") {
    const actorName = getActorName(notification.actor) ?? "A new connection";
    return `${actorName} wants to connect with you.`;
  }
  return FALLBACK_MESSAGE;
}

export function buildNotificationHref(notification: NotificationRecord): string {
  if (notification.target_url) {
    return notification.target_url;
  }
  const { entity } = notification;
  if (entity.group_id && entity.post_id) {
    return `/communities/groups/${entity.group_id}#post-${entity.post_id}`;
  }
  if (entity.post_id) {
    return `/communities/posts/${entity.post_id}`;
  }
  if (entity.group_id) {
    return `/communities/groups/${entity.group_id}`;
  }
  return "/communities/feed";
}

export function formatNotificationTime(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return formatDistanceToNow(date, { addSuffix: true });
}

export function getInitialsFromActor(actor?: NotificationActor | null): string {
  const name = actor?.display_name ?? actor?.handle;
  if (!name) {
    return "";
  }
  const trimmed = name.trim();
  if (!trimmed) {
    return "";
  }
  return trimmed.charAt(0).toUpperCase();
}
