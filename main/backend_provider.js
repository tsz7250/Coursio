const { BackendService } = require('../shared/services/yzu_backend');

let backendInstance = null;

function getBackend() {
    if (!backendInstance) {
        backendInstance = new BackendService();
    }
    return backendInstance;
}

function resetBackend() {
    backendInstance = null;
}

module.exports = { getBackend, resetBackend };
