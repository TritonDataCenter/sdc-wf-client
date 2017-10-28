# sdc-wf-client changelog

## not yet released

(nothing yet)


## 0.3.0

- Cleaned up createJob signature and made WfClient constructor to use
  assert module instead of custom assertions.

  The `createJob` method signature can be one of the following:

      createJob(wf, params, options, cb)
      createJob(wf, params, cb)

  The following options have been removed:

      createJob(params, options, cb)
      createJob(params, cb)

  Both of these cases assumed that there would be a `params.workflow` member
  containing the workflow name, it's to say, exactly the value we expect for
  `wf` on the supported methods.

## 0.2.1

- Always log details about the preloaded workflows uuids. Avoid hitting wf-api
when we do not have a workflow uuid for `createJob`.


## 0.2.0

- Support for building against node v4 without build errors/warnings.


## 0.1.1

The version when this changelog was started.
