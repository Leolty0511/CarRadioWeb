<?php

namespace CarRadioWeb\ForumBridge;

use Flarum\Http\RememberAccessToken;
use Flarum\Http\Rememberer;
use Flarum\User\LoginProvider;
use Flarum\User\User;
use FoF\Passport\Events\SendingResponse;
use Laminas\Diactoros\Response\HtmlResponse;
use Laminas\Diactoros\Stream;

/**
 * FoF Passport normally completes authentication through a Flarum popup.
 * CarRadioWeb starts the flow as a full-page redirect, so provide a fallback
 * for callbacks that do not have a window.opener.
 */
final class PassportResponseListener
{
    public function __construct(private Rememberer $rememberer)
    {
    }

    public function handle(SendingResponse $event): void
    {
        $identifier = (string) $event->user->getId();
        $email = strtolower(trim((string) $event->user->getEmail()));
        $profile = $event->user->toArray();

        if ($identifier === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $this->normalizePopupResponse($event);
            return;
        }

        $user = LoginProvider::logIn('passport', $identifier);
        if (!$user) {
            $user = User::where('email', $email)->first();
        }

        if (!$user) {
            $user = User::register($this->availableUsername($profile, $email), $email, bin2hex(random_bytes(32)));
            $user->activate();
            $user->save();
        }

        if ($user) {
            $nickname = $this->profileNickname($profile);
            if ($nickname !== null && $user->nickname !== $nickname) {
                $user->nickname = $nickname;
                $user->save();
            }

            if (!$user->loginProviders()->where(['provider' => 'passport', 'identifier' => $identifier])->exists()) {
                $user->loginProviders()->create(['provider' => 'passport', 'identifier' => $identifier]);
            }

            $response = new HtmlResponse('<script>window.location.replace("/");</script>');
            $event->response = $this->rememberer->remember($response, RememberAccessToken::generate($user->id));
            return;
        }

        $this->normalizePopupResponse($event);
    }

    private function normalizePopupResponse(SendingResponse $event): void
    {
        $body = (string) $event->response->getBody();
        $pattern = '~<script[^>]*>.*?window\.opener\.app\.authenticationComplete\((.*?)\);.*?</script>~is';

        if (!preg_match($pattern, $body, $matches)) {
            return;
        }

        $payload = $matches[1];
        $fallback = sprintf(
            '<script>(function(){var payload=%s;if(window.opener&&window.opener.app&&typeof window.opener.app.authenticationComplete===\'function\'){window.opener.app.authenticationComplete(payload);window.close();return;}window.location.replace(\'/\');}());</script>',
            $payload
        );
        $stream = new Stream('php://memory', 'wb+');
        $stream->write(str_replace($matches[0], $fallback, $body));
        $stream->rewind();
        $event->response = $event->response->withBody($stream);
    }

    private function availableUsername(array $profile, string $email): string
    {
        $emailName = strstr($email, '@', true);
        $candidate = $profile['nickname'] ?? $profile['name'] ?? $emailName;
        $candidate = is_string($candidate) && $candidate !== '' ? $candidate : 'member';
        $candidate = preg_replace('/[^A-Za-z0-9_-]+/', '', $candidate) ?: 'member';
        $candidate = substr($candidate, 0, 24);
        if (strlen($candidate) < 3) {
            $candidate = 'member_' . $candidate;
        }

        $username = $candidate;
        $suffix = 1;
        while (User::where('username', $username)->exists()) {
            $username = substr($candidate, 0, 24) . '_' . $suffix++;
        }
        return $username;
    }

    private function profileNickname(array $profile): ?string
    {
        $nickname = $profile['nickname'] ?? $profile['name'] ?? null;
        if (!is_string($nickname)) {
            return null;
        }

        $nickname = trim(preg_replace('/[\[\]()<>]/u', '', $nickname) ?? '');
        return $nickname !== '' ? $nickname : null;
    }
}
