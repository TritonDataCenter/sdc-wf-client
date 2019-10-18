# sdc-wf-client

This repository is part of the Joyent Triton project. See the [contribution
guidelines](https://github.com/joyent/triton/blob/master/CONTRIBUTING.md)
and general documentation at the main
[Triton project](https://github.com/joyent/triton) page.

This is a Node.js client library for the Triton core Workflow API service.


## Documentation

See [the wf-client docs here](./docs/index.md).


## Testing

    make test

Currently this assumes a Workflow API endpoint at <http://10.99.99.19>, the
common IP for a [CoaL setup](https://github.com/joyent/triton#getting-started).
To test a workflow API at a different IP run:

    make test WORKFLOW_IP=...


## Development

Before commit, ensure that the following checks are clean:

    make prepush


## Releases

Changes with possible user impact should:

1. Add a note to the changelog (CHANGES.md).
2. Bump the version in package.json and CHANGES.md.
3. Once merged to master, the new version should be tagged and published to npm
   via:

        make cutarelease

   To list to npm accounts that have publish access:

        npm owner ls wf-client

The desire is that users of this package use published versions in their
package.json `dependencies`, rather than depending on git shas.
