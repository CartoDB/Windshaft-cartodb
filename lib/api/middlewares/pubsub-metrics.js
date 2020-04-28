'use strict';

const EVENT_VERSION = '1';
const MAX_LENGTH = 100;

module.exports = function pubSubMetrics ({ enabled, metricsBackend, logger, tags }) {
    if (!enabled) {
        return function pubSubMetricsDisabledMiddleware (req, res, next) {
            next();
        };
    }

    if (!tags || !tags.event) {
        throw new Error('Missing required "event" parameter to report metrics');
    }

    return function pubSubMetricsMiddleware (req, res, next) {
        res.on('finish', () => {
            const { event, attributes } = getEventData(req, res, tags);

            metricsBackend.send(event, attributes)
                .then(() => logger.debug(`PubSubTracker: event '${event}' published succesfully`))
                .catch((error) => logger.error(`ERROR: pubsub middleware failed to publish event '${event}': ${error.message}`));
        });

        return next();
    };
};

function getEventData (req, res, tags) {
    const event = tags.event;
    const extra = {};
    if (tags.from) {
        if (tags.from.req) {
            Object.assign(extra, getFromReq(req, tags.from.req));
        }

        if (tags.from.res) {
            Object.assign(extra, getFromRes(res, tags.from.res));
        }
    }

    const attributes = Object.assign({}, {
        metrics_event: normalizedField(req.get('Carto-Event')),
        event_source: normalizedField(req.get('Carto-Event-Source')),
        event_group_id: normalizedField(req.get('Carto-Event-Group-Id')),
        event_time: new Date().toISOString(),
        user_id: res.locals.userId,
        user_agent: req.get('User-Agent'),
        response_code: res.statusCode.toString(),
        response_time: getResponseTime(res),
        source_domain: req.hostname,
        event_version: EVENT_VERSION
    }, tags.attributes, extra);

    // remove undefined properties
    Object.keys(attributes).forEach(key => attributes[key] === undefined && delete attributes[key]);

    return { event, attributes };
}

function normalizedField (field) {
    if (!field) {
        return undefined;
    }

    return field.toString().trim().substr(0, MAX_LENGTH);
}

// FIXME: 'X-Tiler-Profiler' might not be accurate enough
function getResponseTime (res) {
    const profiler = res.get('X-Tiler-Profiler');
    let stats;

    try {
        stats = JSON.parse(profiler);
    } catch (e) {
        return undefined;
    }

    return stats.total.toString();
}

function getFromReq (req, { query = {}, body = {}, params = {}, headers = {} } = {}) {
    const extra = {};

    for (const [queryParam, eventName] of Object.entries(query)) {
        extra[eventName] = req.query[queryParam];
    }

    for (const [bodyParam, eventName] of Object.entries(body)) {
        extra[eventName] = req.body[bodyParam];
    }

    for (const [pathParam, eventName] of Object.entries(params)) {
        extra[eventName] = req.params[pathParam];
    }

    for (const [header, eventName] of Object.entries(headers)) {
        extra[eventName] = req.get(header);
    }

    return extra;
}

function getFromRes (res, { body = {}, headers = {}, locals = {} } = {}) {
    const extra = {};

    if (res.body) {
        for (const [bodyParam, eventName] of Object.entries(body)) {
            extra[eventName] = res.body[bodyParam];
        }
    }

    for (const [header, eventName] of Object.entries(headers)) {
        extra[eventName] = res.get(header);
    }

    for (const [localParam, eventName] of Object.entries(locals)) {
        extra[eventName] = res.locals[localParam];
    }

    return extra;
}
