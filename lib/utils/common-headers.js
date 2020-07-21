'use strict';

module.exports = function setCommonHeaders (req, res, callback) {
    const { logger } = res.locals;

    res.set('X-Request-Id', logger.bindings().id);

    // TODO: x-layergroupid header??

    const user = getUser({ res });

    if (user) {
        res.set('Carto-User', user);
    }

    const userId = getUserId({ res });

    if (userId) {
        res.set('Carto-User-Id', `${userId}`);
    }

    const mapId = getMapId({ res });

    if (mapId) {
        res.set('Carto-Map-Id', mapId);
    }

    const cacheBuster = getCacheBuster({ res });

    if (cacheBuster) {
        res.set('Carto-Cache-Buster', cacheBuster);
    }

    const templateHash = getTemplateHash({ res });

    if (templateHash) {
        res.set('Carto-Template-Hash', templateHash);
    }

    getStatTag({ res }, (err, statTag) => {
        if (err) {
            logger.warn({ exception: err }, 'Error generating Stat Tag header');
        }

        if (statTag) {
            res.set('Carto-Stat-Tag', statTag);
        }

        callback();
    });
};

function getUser ({ res }) {
    if (res.locals.user) {
        return res.locals.user;
    }
}

function getUserId ({ res }) {
    if (res.locals.userId) {
        return res.locals.userId;
    }
}

function getMapId ({ res }) {
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
    const { logger } = res.locals;

    if (res.locals.templateHash) {
        return res.locals.templateHash;
    }

    if (res.locals.mapConfigProvider && typeof res.locals.mapConfigProvider.getTemplateHash === 'function') {
        let templateHash;

        try {
            templateHash = res.locals.mapConfigProvider.getTemplateHash().substring(0, 8);
        } catch (err) {
            logger.warn({ exception: err }, 'Error generating Stat Tag header');
        }

        return templateHash;
    }
}

function getStatTag ({ res }, callback) {
    if (res.locals.mapConfig) {
        return callback(null, res.locals.mapConfig.obj().stat_tag);
    }

    if (!res.locals.mapConfigProvider) {
        return callback();
    }

    res.locals.mapConfigProvider.getMapConfig((err, mapConfig) => {
        if (err) {
            return callback(err);
        }

        return callback(null, mapConfig.obj().stat_tag);
    });
}
