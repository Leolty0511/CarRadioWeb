<?php

namespace CarRadioWeb\ForumBridge;

use Flarum\Settings\SettingsRepositoryInterface;
use GuzzleHttp\Client;
use Psr\Log\LoggerInterface;

final class ForumEventForwarder
{
    private const SETTING_EVENT_URL = 'carradioweb-forum-bridge.event_url';
    private const SETTING_BRIDGE_SECRET = 'carradioweb-forum-bridge.bridge_secret';

    public function __construct(
        private SettingsRepositoryInterface $settings,
        private LoggerInterface $logger
    ) {
    }

    public function send(array $event): void
    {
        $url = $this->runtimeSetting(self::SETTING_EVENT_URL, 'CARRADIOWEB_FORUM_EVENT_URL');
        $secret = $this->runtimeSetting(self::SETTING_BRIDGE_SECRET, 'CARRADIOWEB_FORUM_BRIDGE_SECRET');
        if ($url === '' || strlen($secret) < 32) {
            $this->logger->warning('[CarRadioWeb Forum Bridge] Event forwarding is not configured.');
            return;
        }

        try {
            $json = json_encode($event, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
            $payload = rtrim(strtr(base64_encode($json), '+/', '-_'), '=');
            $timestamp = (string) time();
            $signature = hash_hmac('sha256', $timestamp . '.' . $payload, $secret);
            $response = (new Client())->post($url, [
                'connect_timeout' => 0.75,
                'timeout' => 2.0,
                'http_errors' => false,
                'headers' => [
                    'Content-Type' => 'application/json',
                    'X-CarRadio-Timestamp' => $timestamp,
                    'X-CarRadio-Signature' => $signature,
                ],
                'json' => ['payload' => $payload],
            ]);
            $status = $response->getStatusCode();
            if ($status < 200 || $status >= 300) {
                $this->logger->warning('[CarRadioWeb Forum Bridge] Event endpoint rejected the request.', [
                    'eventId' => (string) ($event['eventId'] ?? 'unknown'),
                    'status' => $status,
                ]);
            }
        } catch (\Throwable $error) {
            // Notifications must never prevent registration or posting, but
            // failures must remain observable in the normal Flarum log.
            $this->logger->warning('[CarRadioWeb Forum Bridge] Event forwarding failed.', [
                'eventId' => (string) ($event['eventId'] ?? 'unknown'),
                'error' => $error->getMessage(),
            ]);
        }
    }

    private function runtimeSetting(string $settingKey, string $environmentKey): string
    {
        $stored = trim((string) $this->settings->get($settingKey, ''));

        return $stored !== '' ? $stored : trim((string) getenv($environmentKey));
    }
}
