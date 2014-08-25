<!--
    This Source Code Form is subject to the terms of the Mozilla Public
    License, v. 2.0. If a copy of the MPL was not distributed with this
    file, You can obtain one at http://mozilla.org/MPL/2.0/.
-->

<!--
    Copyright (c) 2014, Joyent, Inc.
-->

# Workflow API Client

* Repository: git@git.joyent.com:wf-client.git
* Browsing: <https://mo.joyent.com/wf-client>
* Who: Andres Rodriguez
* Docs: <https://mo.joyent.com/docs/wf-client>
* Tickets/bugs: <https://devhub.joyent.com/jira/browse/WORKFLOW>


# What is WfClient?

This library allows Workflow API clients to manage their own workflows. It is a
simple abstraction of the node-workflow REST API. Currently it supports the
following features:

* Load workflow files from disk into WFAPI
* Find a workflow
* Create jobs
* Find jobs

The distinctive feature that this library provides is being able to drop in any
workflow *compatible* javascript file that can be programatically loaded into
WFAPI, so application developers can write their own custom workflows and use
WfClient to create them with a single function call.

# Getting Started

All you need to use (and test) WfClient is a running WFAPI instance. A sample
unit test is provided for more information about how to load workflows and how
to create jobs for them.

    # To test, get the source.
    git clone git@git.joyent.com:wf-client.git
    cd wf-client/
    make test

	# To use as a module, add the package to your package.json
    ...
        "wf-client": "1.0.0",
    ...

    npm install


## Requiring WfClient Into Your Application

WfClient needs a configuration object with the following keys:

|| **Name** || **Type** || **Description** || **Required** ||
|| url || String || WFAPI location || Yes ||
|| path || String || Path to the workflow files directory || Yes ||
|| log || Bunyan Logger || Bunyan logger instance || Yes ||
|| workflows || Array || List of workflow names to load || No ||

In order to require and initialize a new WfClient, we would then do something
along these lines:

	// Require the module
	//
	var WfClient = require('wf-client');

	// Initialize logger if needed
	//
	var log = new Logger({
	  name: 'wf-client',
	  level: 'info',
	  serializers: {
	      err: Logger.stdSerializers.err,
	      req: Logger.stdSerializers.req,
	      res: restify.bunyan.serializers.response
	  }
	});

	// Config objet for WfClient
	//
	var config = {
	    'workflows': ['say'],
	    'url': 'http://10.99.99.15',
	    'path': './test',
	    'log': log
	};

	// Initialize WfClient
	//
	var wfapi = new WfClient(config);

With this configuration, we are telling WfClient that we our workflows directory
is located at './test' and we have a workflow called 'say'. This means that if
we wanted to load the 'say' workflows into WFAPI, WfClient will assume that
there is a say.js javascript file located at './test/say.js'.

It is not entirely need to list all workflows that WfClient needs to be aware of
from the config file. There are methods to add new workflows to WFAPI
programatically.


