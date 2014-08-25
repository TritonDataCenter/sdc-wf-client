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

function foo(job, cb) {
	return cb(null, 'Bar');
}

var workflow = module.exports = {
    name: 'foobar-' + VERSION,
    version: VERSION,
    chain: [ {
        name: 'foo.bar',
        timeout: 10,
        retry: 1,
        body: foo
    }],
    timeout: 20,
    onerror: [ {
        name: 'On error',
        body: function (job, cb) {
            return cb('Error executing job');
        }
    }]
};