/*
 * Copyright (c) 2012, Joyent, Inc. All rights reserved.
 */

/* Test the WfClient */

var WfClient = require('../lib/wf-client');
var Logger = require('bunyan');
var restify = require('restify');
var assert = require('assert');


var log = new Logger({
    name: 'wf-client',
    level: 'info',
    serializers: {
        err: Logger.stdSerializers.err,
        req: Logger.stdSerializers.req,
        res: restify.bunyan.serializers.res
    }
});

var config = {
    workflows: ['say'],
    url: 'http://10.99.99.19',
    path: './test',
    log: log,
    forceReplace: true,
    agent: false
};

var wfapi;
var wfUuid;
var jobUuid;

var INFO = {
	progress: 10,
	message: 'Under Fire Do not Stop'
};

var VERSION = '1.0.0';


exports.setUp = function(callback) {
	wfapi = new WfClient(config);
	wfapi.initWorkflows(function (err) {
        assert.ifError(err);
		callback();
	});
};


exports.testLoadWorkflow = function (t) {
	wfapi.loadWorkflow('foobar', function (err) {
		assert.ifError(err);
		t.ok(true);
		t.done();
	});
};


exports.testFindWorkflow = function (t) {
	wfapi.findWorkflow('foobar-' + VERSION, function (err, wf) {
		assert.ifError(err);
		t.ok(wf);
		t.ok(wf.uuid);
		wfUuid = wf.uuid;
		t.done();
	});
};


exports.testGetWorkflow = function (t) {
	wfapi.getWorkflow(wfUuid, function (err, wf) {
		assert.ifError(err);
		t.ok(wf);
		t.done();
	});
};


exports.testCreateJob = function (t) {
	var params = {
		name: 'Tester',
		target: 'say',
		task: 'say'
	};

	wfapi.createJob('say', params, function (err, job) {
		assert.ifError(err);
		t.ok(job);
		t.ok(job.uuid);
		jobUuid = job.uuid;
		t.done();
	});
};


exports.testCreateJobUUID = function (t) {
	var params = {
		name: 'Tester',
		target: 'say2',
		task: 'say',
		workflow: wfUuid
	};

	wfapi.createJob(params, function (err, job) {
		assert.ifError(err);
		t.ok(job);
		t.ok(job.uuid);
		t.done();
	});
};


exports.testCreateJobWithRequestId = function (t) {
	var params = {
		name: 'Tester',
		target: 'say-req-id',
		task: 'say',
		workflow: wfUuid
	};
	var headers = { 'x-request-id': 'f923df69-0e55-4c1a-b31b-0da8183a5f81' };

	wfapi.createJob(params, headers, function (err, job) {
		assert.ifError(err);
		t.ok(job);
		t.ok(job.uuid);
		t.done();
	});
};


exports.testGetJob = function (t) {
	wfapi.getJob(jobUuid, function (err, job) {
		assert.ifError(err);
		t.ok(job);
		t.done();
	});
};


exports.testPostJobInfo = function (t) {
	wfapi.postJobInfo(jobUuid, INFO, function (err) {
		assert.ifError(err);
		t.done();
	});
};


exports.testGetJobInfo = function (t) {
	wfapi.getJobInfo(jobUuid, function (err, info) {
		assert.ifError(err);
		t.equal(info[0].progress, INFO.progress);
		t.done();
	});
};


exports.testListJobs = function (t) {
	var query = {
		task: 'say'
	};

	wfapi.listJobs(query, function (err, jobs) {
		assert.ifError(err);
		t.ok(jobs);
		t.ok(jobs.length);
		t.done();
	});
};

