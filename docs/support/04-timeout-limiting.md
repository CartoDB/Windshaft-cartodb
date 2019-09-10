## Timeout limit

Our APIs work following a request <-> response model. While CARTO is busy getting that action done or retrieving that information, part of our infrastructure is devoted to that process and is therefore unavailable for any other user. Typically this is not a problem, as most requests get serviced quickly enough. However, certain requests can take a long time to process, either by design (e.g., updating a huge table) or by mistake. To prevent this long-running queries from effectively blocking the usage of our platform resources, CARTO will discard requests that cannot be fulfilled in less than a certain amount of time.

Maps API is affected by this kind of limiting.

### Per User

Timeout limit is on a per-user basis (or more accurately described, per user access).

### How it works

Every query has a statement timeout. When a request reaches that value, the response returns an error.

### Response Codes

When query exceeds the timeout limit, the API will return an HTTP `429 Too Many Requests` error.

### Tips

You are able to avoid common issues that trigger timeout limits following these actions:

- Always use database indexes
- Try to use batch API to insert/update/delete data

### Timeout Limits Chart

Below, you can find the values of the timeout limit by user account type.

|Enterprise plans  |Individual plans  |Free plans  |
| ---  | ---  | ---  |
| 25 seconds  | 15 seconds  | 5 seconds  |
