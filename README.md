<!--
    This Source Code Form is subject to the terms of the Mozilla Public
    License, v. 2.0. If a copy of the MPL was not distributed with this
    file, You can obtain one at http://mozilla.org/MPL/2.0/.
-->

<!--
    Copyright (c) 2014, Joyent, Inc.
-->

# sdc-wf-client

This library allows Workflow API clients to manage their own workflows and jobs.
It is a simple abstraction of the SDC internal Workflow API.

This repository is part of the Joyent SmartDataCenter project (SDC).  For
contribution guidelines, issues, and general documentation, visit the main
[SDC](http://github.com/joyent/sdc) project page.

# Features

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
    git clone git@github.com:joyent/sdc-wf-client.git
    cd wf-client/
    make test

	# To use as a module, add the package to your package.json
    ...
        "wf-client": "git+ssh://git@github.com:joyent/sdc-wf-client.git",
    ...

    npm install
