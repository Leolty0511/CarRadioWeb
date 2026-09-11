<?php

namespace CarRadioWeb\ForumBridge;

use Flarum\Discussion\Event\Started as DiscussionStarted;
use Flarum\Group\Group;
use Flarum\Post\Event\Posted as PostCreated;
use Flarum\User\Event\Registered as UserRegistered;
use Illuminate\Contracts\Events\Dispatcher;

final class ForumEventSubscriber
{
    public function __construct(private ForumEventForwarder $forwarder)
    {
    }

    public function subscribe(Dispatcher $events): void
    {
        $events->listen(UserRegistered::class, [$this, 'handleUserRegistered']);
        $events->listen(DiscussionStarted::class, [$this, 'handleDiscussionStarted']);
        $events->listen(PostCreated::class, [$this, 'handlePostCreated']);
    }

    public function handleUserRegistered(UserRegistered $event): void
    {
        $user = $event->user;
        $this->forwarder->send([
            'eventId' => 'forum:user:' . $user->id . ':' . $this->timestamp($user->joined_at),
            'type' => 'user_registered',
            'username' => $this->username($user),
            'email' => $this->limit((string) ($user->email ?? ''), 320),
            'occurredAt' => $this->isoTime($user->joined_at),
            'url' => $this->forumUrl(),
        ]);
    }

    public function handleDiscussionStarted(DiscussionStarted $event): void
    {
        $discussion = $event->discussion;
        $this->forwarder->send([
            'eventId' => 'forum:discussion:' . $discussion->id . ':' . $this->timestamp($discussion->created_at),
            'type' => 'discussion_started',
            'username' => $this->username($event->actor),
            'discussionTitle' => $this->limit((string) ($discussion->title ?? ''), 300),
            'content' => $this->limit($this->plainText((string) ($discussion->firstPost->content ?? '')), 2000),
            'occurredAt' => $this->isoTime($discussion->created_at),
            'url' => $this->modelUrl($discussion, 'd/' . $discussion->id),
            'isPrivileged' => $this->isPrivileged($event->actor),
        ]);
    }

    public function handlePostCreated(PostCreated $event): void
    {
        $post = $event->post;
        if ((int) $post->number <= 1 || $post->discussion === null) {
            return;
        }
        $discussion = $post->discussion;
        $this->forwarder->send([
            'eventId' => 'forum:post:' . $post->id . ':' . $this->timestamp($post->created_at),
            'type' => 'post_created',
            'username' => $this->username($event->actor),
            'discussionTitle' => $this->limit((string) ($discussion->title ?? ''), 300),
            'content' => $this->limit($this->plainText((string) ($post->content ?? '')), 2000),
            'occurredAt' => $this->isoTime($post->created_at),
            'url' => $this->modelUrl($post, 'd/' . $discussion->id . '/' . $post->number),
            'isPrivileged' => $this->isPrivileged($event->actor),
        ]);
    }

    private function username($user): string
    {
        if (!is_object($user)) {
            return 'unknown';
        }
        return $this->limit((string) ($user->display_name ?? $user->username ?? 'unknown'), 100);
    }

    private function plainText(string $value): string
    {
        return trim(html_entity_decode(strip_tags($value), ENT_QUOTES | ENT_HTML5, 'UTF-8'));
    }

    private function isPrivileged($user): bool
    {
        if (!is_object($user) || !isset($user->groups)) {
            return false;
        }
        $groupIds = $user->groups->pluck('id')->map(static fn ($id) => (int) $id)->all();
        return in_array(Group::ADMINISTRATOR_ID, $groupIds, true)
            || in_array(Group::MODERATOR_ID, $groupIds, true);
    }

    private function limit(string $value, int $length): string
    {
        return function_exists('mb_substr') ? mb_substr($value, 0, $length) : substr($value, 0, $length);
    }

    private function isoTime(?\DateTimeInterface $time): string
    {
        return ($time ?? new \DateTimeImmutable())->format(DATE_ATOM);
    }

    private function timestamp(?\DateTimeInterface $time): string
    {
        return (string) (($time ?? new \DateTimeImmutable())->getTimestamp());
    }

    private function forumUrl(): string
    {
        return rtrim((string) getenv('FLARUM_BASE_URL'), '/');
    }

    private function modelUrl(object $model, string $fallback): string
    {
        if (method_exists($model, 'getUrl')) {
            $url = trim((string) $model->getUrl());
            if ($url !== '') return preg_match('#^https?://#i', $url) ? $url : $this->forumUrl() . '/' . ltrim($url, '/');
        }
        return $this->forumUrl() . '/' . ltrim($fallback, '/');
    }
}
