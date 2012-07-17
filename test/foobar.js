/*
 * Copyright (c) 2012, Joyent, Inc. All rights reserved.
 *
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