<?php

namespace CarRadioWeb\ForumBridge;

use GuzzleHttp\Client;

final class ForumEventForwarder
{
    public function send(array $event): void
    {
        $url = trim((string) getenv('CARRADIOWEB_FORUM_EVENT_URL'));
        $secret = trim((string) getenv('CARRADIOWEB_FORUM_BRIDGE_SECRET'));
        if ($url === '' || strlen($secret) < 32) {
            return;
        }

        try {
            $json = json_encode($event, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
            $payload = rtrim(strtr(base64_encode($json), '+/', '-_'), '=');
            $timestamp = (string) time();
            $signature = hash_hmac('sha256', $timestamp . '.' . $payload, $secret);
            (new Client())->post($url, [
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
        } catch (\Throwable $error) {
            // Notifications must never prevent registration or posting.
        }
    }
}
