/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2014, Joyent, Inc.
 */

/*
 * A brief overview of this source file: what is its purpose.
 */

var VERSION = '1.0.0';

function hi(job, cb) {
    var name = job.params.name || 'Stranger';

    return cb(null, 'Hi there, ' + name);
}

function hello(job, cb) {
    return cb(null, 'Hello again');
}

var workflow = module.exports = {
    name: 'say-' + VERSION,
    version: VERSION,
    chain: [ {
        name: 'say.hi',
        timeout: 10,
        retry: 1,
        body: hi
    }, {
        name: 'say.hello',
        timeout: 10,
        retry: 1,
        body: hello
    }],
    timeout: 20,
    onerror: [ {
        name: 'On error',
        body: function (job, cb) {
            return cb('Error executing job');
        }
    }]
};