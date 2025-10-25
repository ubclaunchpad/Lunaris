exports.handler = async (event) => {
    return {
        statusCode: 200,
        message: `Hello, ${event.name || 'World'}!`,
        timestamp: new Date().toISOString()
    };
};