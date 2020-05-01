'use strict';

const EVENT_VERSION = '1';
const MAX_LENGTH = 100;

module.exports = function metrics ({ enabled, tags, metricsBackend, logger }) {
    if (!enabled) {
        return function metricsDisabledMiddleware (req, res, next) {
            next();
        };
    }

    if (!tags || !tags.event) {
        throw new Error('Missing required "event" parameter to report metrics');
    }

    return function metricsMiddleware (req, res, next) {
        res.on('finish', () => {
            const { event, attributes } = getEventData(req, res, tags);

            metricsBackend.send(event, attributes)
                .catch((error) => logger.error(`Failed to publish event "${event}": ${error.message}`));
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
        client_event: normalizedField(req.get('Carto-Event')),
        client_event_group_id: normalizedField(req.get('Carto-Event-Group-Id')),
        event_source: normalizedField(req.get('Carto-Event-Source')),
        event_time: new Date().toISOString(),
        user_id: res.locals.userId,
        user_agent: req.get('User-Agent'),
        map_id: getLayergroupid({ res }),
        cache_buster: getCacheBuster({ res }),
        template_hash: getTemplateHash({ res }),
        stat_tag: getStatTag({ res }),
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

function getLayergroupid ({ res }) {
    if (res.locals.token) {
        return res.locals.token;
    }

    if (res.locals.mapConfig) {
        return res.locals.mapConfig.id();
    }

    if (res.locals.mapConfigProvider && res.locals.mapConfigProvider.mapConfig) {
        return res.locals.mapConfigProvider.mapConfig.id();
    }
}

function getCacheBuster ({ res }) {
    if (res.locals.cache_buster !== undefined) {
        return `${res.locals.cache_buster}`;
    }

    if (res.locals.mapConfigProvider) {
        return `${res.locals.mapConfigProvider.getCacheBuster()}`;
    }
}

function getTemplateHash ({ res }) {
    if (res.locals.templateHash) {
        return res.locals.templateHash;
    }

    if (res.locals.mapConfigProvider && res.locals.mapConfigProvider.getTemplateHash) {
        let templateHash;

        try {
            templateHash = res.locals.mapConfigProvider.getTemplateHash().substring(0, 8);
        } catch (e) {}

        return templateHash;
    }
}

function getStatTag ({ res }) {
    if (res.locals.mapConfig) {
        return res.locals.mapConfig.obj().stat_tag;
    }

    // FIXME: don't expect that mapConfig is already set
    if (res.locals.mapConfigProvider && res.locals.mapConfigProvider.mapConfig) {
        return res.locals.mapConfigProvider.mapConfig.obj().stat_tag;
    }
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

    return stats && stats.total ? stats.total.toString() : undefined;
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
