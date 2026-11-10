const PUBLIC_PROFILE = require('../../config/public-zai-profile.json');

function getBehavioralProfile() {
  return PUBLIC_PROFILE.behavioralProfile;
}

function getPublicFacts() {
  return PUBLIC_PROFILE.facts;
}

function getPublicSources() {
  return PUBLIC_PROFILE.sourcePolicy.sources;
}

function getPublicBasis() {
  return {
    profileVersion: PUBLIC_PROFILE.version,
    label: 'RESUME · PORTFOLIO · WEBSITE',
    sourceCount: PUBLIC_PROFILE.sourcePolicy.sources.length,
  };
}

module.exports = {
  PUBLIC_PROFILE,
  getBehavioralProfile,
  getPublicFacts,
  getPublicSources,
  getPublicBasis,
};
