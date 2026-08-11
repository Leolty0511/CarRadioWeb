<?php

use CarRadioWeb\ForumBridge\ForumBridgeMiddleware;
use Flarum\Extend;

return [
    (new Extend\Middleware('forum'))->add(ForumBridgeMiddleware::class),
    (new Extend\Middleware('api'))->add(ForumBridgeMiddleware::class),
];
