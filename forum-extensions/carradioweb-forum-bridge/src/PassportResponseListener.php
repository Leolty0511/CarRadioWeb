<?php

namespace CarRadioWeb\ForumBridge;

use FoF\Passport\Events\SendingResponse;
use Laminas\Diactoros\Stream;

/**
 * FoF Passport normally completes authentication through a Flarum popup.
 * CarRadioWeb starts the flow as a full-page redirect, so provide a fallback
 * for callbacks that do not have a window.opener.
 */
final class PassportResponseListener
{
    public function handle(SendingResponse $event): void
    {
        $body = (string) $event->response->getBody();
        $pattern = '~<script>window\.close\(\);\s*window\.opener\.app\.authenticationComplete\((.*?)\);</script>~s';

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
}
