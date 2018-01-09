'use strict';

module.exports = ({ metadataBackend }) => (req, res, next) => {
  const userContext = res.locals.userContext;
  metadataBackend.getUserBasicInfo(res.locals.user, (err, metadata) => {
      userContext.metadata = metadata;
      next();
    });
};
