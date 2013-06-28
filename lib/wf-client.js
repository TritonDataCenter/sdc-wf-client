/*
 * Copyright (c) 2012, Joyent, Inc. All rights reserved.
 *
 * A brief overview of this source file: what is its purpose.
 */


var restify = require('restify');
var assert = require('assert-plus');
var path = require('path');
var async = require('async');
var backoff = require('backoff');


/*
 * WfClient Constructor
 */
function WfClient(options) {
    if (!options || typeof (options) !== 'object')
        throw new TypeError('options is required (object)');
    if (!options.url)
        throw new TypeError('url is required (string)');
    if (!options.path)
        throw new TypeError('path is required (string)');
    if (!options.log)
        throw new TypeError('log is required (bunyan Logger instance)');

    var restifyOptions = {
        url: options.url,
        version: '*',
        log: options.log
    };

    if (options.agent !== undefined) restifyOptions.agent = options.agent;
    this.client = restify.createJsonClient(restifyOptions);

    this.retry = options.retry || {};
    this.log = options.log;
    this.path = options.path;
    this.forceReplace = options.forceReplace || false;
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
            log.error(err, 'wfapi: could not connect after %d attempts',
            retry.getResults().length);
        } else {
            log.debug('wfapi: connected after %d attempts',
            retry.getResults().length);
        }

        callback(err);
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
        if (cb) { cb(err); }
    }

    function create() {
        self.createWorkflow(wf, function (aerr, uuid) {
            if (aerr) {
                self.log.error(aerr, 'Error adding ' + wfName);
            } else {
                self.log.debug(wfName + ' workflow added');
                self.uuids[wf] = uuid;
            }

            return callback(aerr);
        });
    }

    self.findWorkflow(wfName, function (err, obj) {
        if (err) {
            self.log.error(err, 'Error getting workflow ' + wfName);
            return callback(err);
        } else if (obj) {
            if (self.forceReplace) {
                self.log.debug('Replacing ' + wfName);
                self.deleteWorkflow(obj.uuid, function (deleteErr) {
                    if (deleteErr) {
                        self.log.error(deleteErr, 'Error deleting ' + wfName);
                        return callback(deleteErr);
                    } else {
                        create();
                    }
                });
            } else {
                self.log.debug(wfName + ' workflow exists');
                self.uuids[wf] = obj.uuid;
                return callback(null);
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
    this.client.get('/workflows', function (err, req, res, wfs) {
        if (err) {
            return cb(err);
        }

        if (!wfs.length) {
            return cb(null, null);
        }

        for (var i = 0; i < wfs.length; i++) {
            var wf = wfs[i];

            if (wf.name === name) {
                return cb(null, wf);
            }
        }

        return cb(null, null);
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

    return wf;
};



/*
 * Queues a new job. This function takes two forms:
 *
 * - createJob(wf, params, options, cb)
 * - createJob(params, options, cb)
 *
 * Options is an optional arg in both cases so the functions would normally
 * (at the moment) take this form:
 *
 * - createJob(wf, params, cb)
 * - createJob(params, cb)
 *
 * @param wf {String} The workflow name.
 * @param params {Object} The job parameters.
 * @param params.workflow {String} The workflow name when passed in the params.
 * @param options {Object} Optional. Additional options to pass.
 * @param options.headers {Object} Optional. Additional request headers to pass.
 * @param cb {Function} Callback of the form fb(err, job).
 */
WfClient.prototype.createJob = function () {
    var wf, params, options, headers, cb, opts;

    switch (arguments.length) {
        case 2:
            params = arguments[0];
            cb = arguments[1];
            break;
        case 3:
            if (typeof (arguments[0]) === 'string') {
                wf = arguments[0];
                params = arguments[1];
                cb = arguments[2];
            } else {
                params = arguments[0];
                options = arguments[1];
                cb = arguments[2];
            }
            break;
        case 4:
            wf = arguments[0];
            params = arguments[1];
            options = arguments[2];
            cb = arguments[3];
            break;
        default:
            throw new Error('Invalid number of arguments');
    }

    if (!params || typeof (params) !== 'object')
        throw new TypeError('params is required (object)');
    if (!wf && !params.workflow) {
        throw new TypeError('workflow name \'wf\' or uuid \'params.workflow\'' +
            ' is required (string)');
    }
    if (!params.target)
        throw new TypeError('job target is required (string)');

    // Options is optional
    assert.optionalObject(options, 'options');
    if (options) {
        assert.optionalObject(options.headers, 'options.headers');
    }

    var self = this;
    params.workflow = params.workflow || self.uuids[wf];

    opts = { path: '/jobs' };
    if (options && options.headers) {
        opts.headers = options.headers;
    }
    this.client.post(opts, params, function (err, req, res, job) {
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
