/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright 2017 Joyent, Inc.
 */

/*
 * A client library for Triton's WFAPI.
 */


var assert = require('assert-plus');
var async = require('async');
var backoff = require('backoff');
var crypto = require('crypto');
var path = require('path');
var Tracer = require('triton-tracer');

var restifyClients = Tracer.restifyClient;

/*
 * WfClient Constructor
 */
function WfClient(options) {
    assert.object(options, 'options');
    assert.string(options.url, 'options.url');
    assert.string(options.path, 'options.path');
    assert.object(options.log, 'options.log');

    var restifyOptions = {
        url: options.url,
        version: '*',
        log: options.log,
        contentMd5: {
            encodings: ['utf8', 'binary']
        }
    };

    if (options.agent !== undefined) restifyOptions.agent = options.agent;
    this.client = restifyClients.createJsonClient(restifyOptions);

    this.retry = options.retry || {};
    this.log = options.log;
    this.path = options.path;
    this.forceReplace = options.forceReplace || false;
    this.forceMd5Check = options.forceMd5Check || false;
    this.workflows = options.workflows || [];
    this.uuids = {};
}



/*
 * Intializes all workflows that a client needs to be aware of. A single failure
 * loading a workflow will be considered a backoff. In the next attempt,
 * loadWorklow does a find-or-create for each workflow anyway.
 */
WfClient.prototype.initWorkflows = function (callback) {
    assert.optionalFunc(callback, 'callback');

    var self = this;
    var log = this.log;
    var retryOpts = this.retry;

    var retry = backoff.call(load, {}, function (err) {
        retry.removeAllListeners('backoff');
        if (err) {
            log.error(err, 'wfapi: could not connect');
        } else {
            log.debug('wfapi: connected');
        }

        if (callback) {
            callback(err);
        }
    });

    retry.setStrategy(new backoff.ExponentialStrategy({
        initialDelay: retryOpts.minTimeout || 100,
        maxDelay: retryOpts.maxTimeout || 60000
    }));

    retry.failAfter(retryOpts.retries || Infinity);
    retry.on('backoff', function onBackoff(number, delay) {
        var level;
        if (number === 0) {
            level = 'info';
        } else if (number < 5) {
            level = 'warn';
        } else {
            level = 'error';
        }
        log[level]({
            attempt: number,
            delay: delay
        }, 'connect attempted');
    });

    retry.start();

    function load(_, cb) {
        async.mapSeries(self.workflows, function (wf, next) {
            self.loadWorkflow(wf, function (err) {
                return next(err);
            });
        }, function (err2) {
            return cb(err2);
        });
    }
};



/*
 * Loads a workflow. A new workflow is created when there is none
 * yet or when we want to replace an existing one
 */
WfClient.prototype.loadWorkflow = function (wf, cb) {
    var self = this;

    // Will load something like provision.js
    // The workflow now wil be name-file.version or file.name if version
    // was not given.
    var file = require(path.resolve(this.path, wf));
    var wfName = (wf + '-' + file.version) || file.name;

    function callback(err) {
        if (cb) {
            cb(err);
        }
    }

    function create() {
        self.createWorkflow(wf, function (aerr, uuid) {
            if (aerr) {
                self.log.error(aerr, 'Error adding ' + wfName);
            } else {
                self.log.info(wfName + ' workflow added (' + uuid + ')');
                self.uuids[wf] = uuid;
            }

            return callback(aerr);
        });
    }


    function update(uuid) {
        self.updateWorkflow(wf, uuid, function (aerr, auuid) {
            if (aerr) {
                self.log.error(aerr, 'Error updating ' + wfName);
            } else {
                self.log.info(wfName + ' workflow updated (' + uuid + ')');
                self.uuids[wf] = uuid;
            }

            return callback(aerr);
        });
    }

    self.findWorkflow(wfName, function (err, obj) {
        if (err) {
            self.log.error(err, 'Error getting workflow ' + wfName);
            callback(err);
        } else if (obj) {
            if (self.forceReplace ||
                (self.forceMd5Check && !self.md5Matches(obj, wf))) {
                self.log.debug('Updating ' + wfName);
                update(obj.uuid);
            } else {
                self.log.info(wfName + ' workflow exists (' + obj.uuid + ')');
                self.uuids[wf] = obj.uuid;
                callback(null);
            }
        } else {
            create();
        }
    });
};



/*
 * Retrieves a workflow by name.
 */
WfClient.prototype.findWorkflow = function (name, cb) {
    var opts = { path: '/workflows', query: { name: name } };
    this.client.get(opts, function (err, req, res, wfs) {
        if (err) {
            return cb(err);
        }

        if (!wfs || !wfs.length) {
            return cb(null, null);
        } else {
            return cb(null, wfs[0]);
        }
    });
};



/*
 * Retrieves a workflow by uuid.
 */
WfClient.prototype.getWorkflow = function (uuid, cb) {
    this.client.get('/workflows/' + uuid, function (err, req, res, wf) {
        if (err) {
            return cb(err);
        }

        return cb(null, wf);
    });
};



/*
 * Deletes a workflow by uuid.
 */
WfClient.prototype.deleteWorkflow = function (uuid, cb) {
    this.client.del('/workflows/' + uuid, function (err, req, res) {
        if (err) {
            return cb(err);
        }

        return cb(null);
    });
};


/*
 * Pings the workflow API service to check for availability.
 */
WfClient.prototype.ping = function (cb) {
    this.client.get('/ping', function (err, req, res, pong) {
        if (err) {
            return cb(err);
        }

        return cb(null, pong);
    });
};



/*
 * Gets the MD5 values of the local and remote workflows' chain and onerror,
 * compars them and returns a boolean that says wether or not they match.
 */
WfClient.prototype.md5Matches = function (wf, name) {
    var self = this;
    var file = require(path.resolve(this.path, name));
    var serialized = self.serializeWorkflow(file);
    var i;

    // Sanitize UUIDs so we can properly compute its MD5
    if (wf.chain.length) {
        for (i = 0; i < wf.chain.length; i++) {
            delete wf.chain[i].uuid;
        }
    }

    if (wf.onerror.length) {
        for (i = 0; i < wf.onerror.length; i++) {
            delete wf.onerror[i].uuid;
        }
    }

    var localOnerrMd5 = crypto.createHash('md5').
        update(JSON.stringify(serialized.onerror)).digest('hex');
    var localChainMd5 = crypto.createHash('md5').
        update(JSON.stringify(serialized.chain)).digest('hex');
    var remoteOnerrMd5 = crypto.createHash('md5').
        update(JSON.stringify(wf.onerror)).digest('hex');
    var remoteChainMd5 = crypto.createHash('md5').
        update(JSON.stringify(wf.chain)).digest('hex');

    return (localChainMd5 === remoteChainMd5 &&
        localOnerrMd5 === remoteOnerrMd5);
};



/*
 * Creates a workflow on WFAPI.
 */
WfClient.prototype.createWorkflow = function (name, cb) {
    var self = this;
    var file = require(path.resolve(this.path, name));

    var serialized = self.serializeWorkflow(file);

    self.client.post('/workflows', serialized, function (err, req, res, wf) {
        if (err) {
            return cb(err);
        }

        return cb(null, wf.uuid);
    });
};



/*
 * Updates a workflow on WFAPI.
 */
WfClient.prototype.updateWorkflow = function (name, uuid, cb) {
    var self = this;
    var file = require(path.resolve(this.path, name));

    var serialized = self.serializeWorkflow(file);
    var p = '/workflows/' + uuid;

    self.client.put(p, serialized, function (err, req, res, wf) {
        if (err) {
            return cb(err);
        }

        return cb(null, wf.uuid);
    });
};



/*
 * Serializes a workflow object. This function is basically converting object
 * properties that are functions into strings, so they can be properly
 * represented as JSON
 */
WfClient.prototype.serializeWorkflow = function (wf) {
    var i;

    if (wf.chain.length) {
        for (i = 0; i < wf.chain.length; i++) {
            if (wf.chain[i].body)
                wf.chain[i].body = wf.chain[i].body.toString();

            if (wf.chain[i].fallback) {
                wf.chain[i].fallback = wf.chain[i].fallback.toString();
            }
        }
    }

    if (wf.onerror.length) {
        for (i = 0; i < wf.onerror.length; i++) {
            if (wf.onerror[i].body) {
                wf.onerror[i].body = wf.onerror[i].body.toString();
            }
      }
    }

    if (wf.oncancel && wf.oncancel.length) {
        for (i = 0; i < wf.oncancel.length; i++) {
            if (wf.oncancel[i].body) {
                wf.oncancel[i].body = wf.oncancel[i].body.toString();
            }
      }
    }

    return wf;
};



/*
 * Queues a new job. This function takes the form:
 *
 * - createJob(wf, params, options, cb)
 *
 * Where options argument is optional, so it can be called as:
 *
 * - createJob(wf, params, cb)
 *
 * @param wf {String} The workflow name.
 * @param params {Object} The job parameters.
 * @param params.target {String} The workflow target. Required.
 * @param options {Object} Optional. Additional options to pass.
 * @param options.headers {Object} Optional. Additional request headers to pass.
 * @param cb {Function} Callback of the form fb(err, job).
 */
WfClient.prototype.createJob = function (wf, params, options, cb) {
    assert.string(wf, 'wf');
    assert.object(params, 'params');
    if (typeof (options) === 'function') {
        cb = options;
        options = {};
    }
    assert.object(options, 'options');
    assert.func(cb, 'cb');

    assert.string(params.target, 'params.target');
    if (options) {
        assert.optionalObject(options.headers, 'options.headers');
    }

    var self = this;
    params.workflow = self.uuids[wf];

    // If the workflow is missing at this point, we will fail here without
    // hitting wf-api:
    if (!params.workflow) {
        self.log.error({
            wf: wf,
            uuids: self.uuids
        }, 'Cannot load wf uuid');

        return cb(new Error('workflow uuid is not specified and cannot be ' +
            'loaded from wfapi client uuids'));
    }
    var postOpts = {path: '/jobs'};
    if (options.headers) {
        postOpts.headers = options.headers;
    }
    return this.client.post(postOpts, params, function (err, req, res, job) {
        if (err) {
            return cb(err);
        }

        assert.ok(job.uuid);
        assert.equal(job.execution, 'queued');
        return cb(null, job);
    });
};



/*
 * Retrieves a job by uuid.
 */
WfClient.prototype.getJob = function (uuid, cb) {
    this.client.get('/jobs/' + uuid, function (err, req, res, job) {
        if (err) {
            return cb(err);
        }

        return cb(null, job);
    });
};



/*
 * Posts job info.
 */
WfClient.prototype.postJobInfo = function (uuid, info, cb) {
    this.client.post('/jobs/' + uuid + '/info', info, function (err, req, res) {
        if (err) {
            return cb(err);
        }

        return cb(null);
    });
};



/*
 * Retrieves info for a job with the given uuid.
 */
WfClient.prototype.getJobInfo = function (uuid, cb) {
    this.client.get('/jobs/' + uuid + '/info', function (err, req, res, info) {
        if (err) {
            return cb(err);
        }

        return cb(null, info);
    });
};



/*
 * Lists jobs.
 */
WfClient.prototype.listJobs = function (params, cb) {
    var getParams = { path: '/jobs' };
    getParams.query = params;

    this.client.get(getParams, function (err, req, res, jobs) {
        if (err) {
            return cb(err);
        }

        return cb(null, jobs);
    });
};



WfClient.prototype.close = function () {
    this.client.close();
};

module.exports = WfClient;
