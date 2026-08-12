<?php

use CarRadioWeb\ForumBridge\ForumBridgeMiddleware;
use CarRadioWeb\ForumBridge\PassportResponseListener;
use FoF\Passport\Events\SendingResponse;
use Flarum\Extend;

return [
    (new Extend\Frontend('forum'))->js(__DIR__.'/js/dist/forum.js'),
    (new Extend\Middleware('forum'))->add(ForumBridgeMiddleware::class),
    (new Extend\Middleware('api'))->add(ForumBridgeMiddleware::class),
    (new Extend\Event())->listen(SendingResponse::class, PassportResponseListener::class),
];
