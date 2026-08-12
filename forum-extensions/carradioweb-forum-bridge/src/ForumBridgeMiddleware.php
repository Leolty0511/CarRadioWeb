<?php

namespace CarRadioWeb\ForumBridge;

use Flarum\User\User;
use Laminas\Diactoros\Stream;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;

final class ForumBridgeMiddleware implements MiddlewareInterface
{
    private const COOKIE_NAME = 'carradioweb_forum_bridge';
    private const TTL_SECONDS = 120;

    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        $response = $handler->handle($request);
        $response = $this->normalizePassportResponse($request, $response);
        $secret = trim((string) getenv('CARRADIOWEB_FORUM_BRIDGE_SECRET'));
        $actor = $request->getAttribute('actor');

        if (strlen($secret) < 32 || !$actor instanceof User || $actor->isGuest() || !$actor->email) {
            return $response;
        }

        $issuedAt = time();
        $claims = [
            'forum_user_id' => (string) $actor->id,
            'email' => strtolower(trim((string) $actor->email)),
            'username' => (string) $actor->username,
            'avatar_url' => (string) ($actor->avatar_url ?? ''),
            'nonce' => bin2hex(random_bytes(24)),
            'iat' => $issuedAt,
            'exp' => $issuedAt + self::TTL_SECONDS,
        ];
        $encoded = $this->base64UrlEncode((string) json_encode($claims, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
        $signature = $this->base64UrlEncode(hash_hmac('sha256', $encoded, $secret, true));
        $cookie = self::COOKIE_NAME . '=' . $encoded . '.' . $signature
            . '; Path=/; Max-Age=' . self::TTL_SECONDS
            . '; HttpOnly; Secure; SameSite=Lax';

        $domain = trim((string) getenv('CARRADIOWEB_FORUM_BRIDGE_COOKIE_DOMAIN'));
        if ($domain !== '') {
            $cookie .= '; Domain=' . $domain;
        }

        return $response->withAddedHeader('Set-Cookie', $cookie);
    }

    /**
     * FoF Passport renders a popup-only callback page. The main site starts
     * the flow with a full-page redirect, so there is no Flarum opener to
     * receive authenticationComplete(). Redirect to the forum instead.
     */
    private function normalizePassportResponse(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        if (strtoupper($request->getMethod()) !== 'GET' || $request->getUri()->getPath() !== '/auth/passport') {
            return $response;
        }

        $contentType = strtolower($response->getHeaderLine('Content-Type'));
        if ($contentType !== '' && strpos($contentType, 'text/html') === false) {
            return $response;
        }

        $body = (string) $response->getBody();
        $pattern = '~<script[^>]*>.*?window\.opener\.app\.authenticationComplete\((.*?)\);.*?</script>~is';
        if (!preg_match($pattern, $body, $matches)) {
            return $response;
        }

        $payload = $matches[1];
        $fallback = sprintf(
            '<script>(function(){var payload=%s;if(window.opener&&window.opener.app&&typeof window.opener.app.authenticationComplete===\'function\'){window.opener.app.authenticationComplete(payload);window.close();return;}window.location.replace(\'/\');}());</script>',
            $payload
        );

        $stream = new Stream('php://memory', 'wb+');
        $stream->write(str_replace($matches[0], $fallback, $body));
        $stream->rewind();

        return $response->withBody($stream);
    }

    private function base64UrlEncode(string $value): string
    {
        return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
    }
}
