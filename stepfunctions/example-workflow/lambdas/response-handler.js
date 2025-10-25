exports.handler = async (event) => {
    return {
        statusCode: 200,
        response: `Processing completed for: ${event.message || 'unknown'}`,
        processedAt: new Date().toISOString()
    };
};