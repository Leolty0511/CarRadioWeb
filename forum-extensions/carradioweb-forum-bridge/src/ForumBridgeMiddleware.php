<?php

namespace CarRadioWeb\ForumBridge;

use Flarum\Foundation\Config;
use Flarum\Settings\SettingsRepositoryInterface;
use Flarum\User\User;
use GuzzleHttp\Client;
use Laminas\Diactoros\Stream;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;

final class ForumBridgeMiddleware implements MiddlewareInterface
{
    private const COOKIE_NAME = 'carradioweb_forum_bridge';
    private const TTL_SECONDS = 120;
    private const SETTING_SITE_URL = 'carradioweb-forum-bridge.site_url';
    private const SETTING_SITE_BRAND = 'carradioweb-forum-bridge.site_brand';
    private const SETTING_SITE_BRAND_FETCHED_AT = 'carradioweb-forum-bridge.site_brand_fetched_at';
    private const SITE_BRAND_CACHE_SECONDS = 300;

    public function __construct(
        private SettingsRepositoryInterface $settings,
        private Config $config
    ) {
    }

    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        $response = $handler->handle($request);
        $response = $this->normalizePassportLoginButton($response);
        $response = $this->injectHomeSiteLink($response);
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
        $pattern = '~<script[^>]*>.*?window\\.opener\\.app\\.authenticationComplete\\((.*?)\\);.*?</script>~is';
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

    /**
     * Flarum's default LogInButton opens Passport in a small popup. The main
     * site starts the OAuth flow as a full-page redirect, so use the current
     * browser window for the Passport button as well.
     */
    private function normalizePassportLoginButton(ResponseInterface $response): ResponseInterface
    {
        $contentType = strtolower($response->getHeaderLine('Content-Type'));
        if ($contentType !== '' && strpos($contentType, 'text/html') === false) {
            return $response;
        }

        $body = (string) $response->getBody();
        if (stripos($body, 'carradiowebPassportNavigation') !== false) {
            return $response;
        }

        $script = <<<'HTML'
<script>(function(){if(window.__carradiowebPassportNavigation)return;window.__carradiowebPassportNavigation=true;var title=(document.documentElement.lang||'').toLowerCase().indexOf('zh')===0?'主站登录':'Main site login';var normalize=function(){document.querySelectorAll('.LogInButton--passport').forEach(function(button){if(button.textContent!==title)button.textContent=title;button.style.whiteSpace='nowrap';button.style.overflow='visible';button.style.textOverflow='clip';});};normalize();if(document.body)new MutationObserver(normalize).observe(document.body,{childList:true,subtree:true});document.addEventListener('click',function(event){var target=event.target;if(!(target instanceof Element))return;var button=target.closest('.LogInButton--passport');if(!button)return;event.preventDefault();event.stopImmediatePropagation();window.location.assign(new URL('/auth/passport',window.location.origin).toString());},true);}());</script>
HTML;
        $updated = preg_replace('~</body>~i', $script . '</body>', $body, 1);
        if (!is_string($updated) || $updated === $body) {
            return $response;
        }

        $stream = new Stream('php://memory', 'wb+');
        $stream->write($updated);
        $stream->rewind();

        return $response->withoutHeader('Content-Length')->withBody($stream);
    }

    private function injectHomeSiteLink(ResponseInterface $response): ResponseInterface
    {
        $contentType = strtolower($response->getHeaderLine('Content-Type'));
        if ($contentType !== '' && strpos($contentType, 'text/html') === false) {
            return $response;
        }

        $home = $this->mainSiteUrl();
        if ($home === '') {
            return $response;
        }

        $body = (string) $response->getBody();
        if (stripos($body, 'carradiowebHomeNavigation') !== false) {
            return $response;
        }

        $jsonFlags = JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT;
        $homeJson = json_encode($home, $jsonFlags);
        $brandJson = json_encode($this->mainSiteBrand($home), $jsonFlags);
        $script = '<script>(function(){if(window.__carradiowebHomeNavigation)return;window.__carradiowebHomeNavigation=true;var home=' . $homeJson . ';var brand=' . $brandJson . ';var zh=(document.documentElement.lang||"").toLowerCase().indexOf("zh")===0;var label=brand?(zh?"返回 "+brand+" 官网":"Back to "+brand):(zh?"返回官网":"Back to Website");var add=function(){if(document.querySelector(".carradioweb-home-link"))return;var nav=document.querySelector(".Header-controls");if(!nav)return;var li=document.createElement("li");li.className="item-carradioweb-home";var a=document.createElement("a");a.className="Button Button--link carradioweb-home-link";a.href=home;a.textContent=label;li.appendChild(a);nav.insertBefore(li,nav.firstChild);};add();if(document.body)new MutationObserver(add).observe(document.body,{childList:true,subtree:true});}());</script>';
        $updated = preg_replace('~</body>~i', $script . '</body>', $body, 1);
        if (!is_string($updated) || $updated === $body) {
            return $response;
        }

        $stream = new Stream('php://memory', 'wb+');
        $stream->write($updated);
        $stream->rewind();

        return $response->withoutHeader('Content-Length')->withBody($stream);
    }

    private function mainSiteBrand(string $home): string
    {
        $cached = trim((string) $this->settings->get(self::SETTING_SITE_BRAND, ''));
        $fetchedAt = (int) $this->settings->get(self::SETTING_SITE_BRAND_FETCHED_AT, '0');
        if ($fetchedAt > 0 && time() - $fetchedAt < self::SITE_BRAND_CACHE_SECONDS) {
            return $cached;
        }

        try {
            $response = (new Client())->get($home . '/api/site-settings?language=en', [
                'connect_timeout' => 0.5,
                'timeout' => 1.0,
                'http_errors' => false,
                'headers' => ['Accept' => 'application/json'],
            ]);
            if ($response->getStatusCode() < 200 || $response->getStatusCode() >= 300) {
                return $cached;
            }
            $payload = json_decode((string) $response->getBody(), true);
            $data = is_array($payload) && is_array($payload['data'] ?? null) ? $payload['data'] : [];
            foreach (['logoText', 'siteName'] as $key) {
                $value = trim((string) ($data[$key] ?? ''));
                if ($value !== '') {
                    $brand = function_exists('mb_substr') ? mb_substr($value, 0, 50) : substr($value, 0, 50);
                    $this->settings->set(self::SETTING_SITE_BRAND, $brand);
                    $this->settings->set(self::SETTING_SITE_BRAND_FETCHED_AT, (string) time());
                    return $brand;
                }
            }
            $this->settings->set(self::SETTING_SITE_BRAND, '');
            $this->settings->set(self::SETTING_SITE_BRAND_FETCHED_AT, (string) time());
        } catch (\Throwable) {
            // The forum must remain usable when the main site is unavailable.
            return $cached;
        }

        return '';
    }

    private function mainSiteUrl(): string
    {
        $candidates = [
            trim((string) $this->settings->get(self::SETTING_SITE_URL, '')),
            trim((string) getenv('CARRADIOWEB_FRONTEND_URL')),
            trim((string) getenv('FRONTEND_URL')),
        ];
        foreach ($candidates as $candidate) {
            if ($this->isHttpUrl($candidate)) {
                return rtrim($candidate, '/');
            }
        }

        $forum = rtrim((string) $this->config->url(), '/');
        $derived = (string) preg_replace('#://forum\\.#i', '://', $forum);
        if ($this->isHttpUrl($derived) && strcasecmp($derived, $forum) !== 0) {
            return $derived;
        }

        return '';
    }

    private function isHttpUrl(string $value): bool
    {
        if ($value === '' || filter_var($value, FILTER_VALIDATE_URL) === false) {
            return false;
        }
        $scheme = strtolower((string) parse_url($value, PHP_URL_SCHEME));

        return $scheme === 'http' || $scheme === 'https';
    }

    private function base64UrlEncode(string $value): string
    {
        return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
    }
}
