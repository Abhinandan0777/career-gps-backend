import pool from '../config/database.js';

/**
 * Execute a parameterized query
 * @param {string} text - SQL query with $1, $2, etc. placeholders
 * @param {Array} params - Array of parameter values
 * @returns {Promise<Object>} Query result
 */
export async function query(text, params = []) {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    
    // Log queries in development
    if (process.env.NODE_ENV === 'development') {
      console.log('Executed query', { text, duration, rows: result.rowCount });
    }
    
    return result;
  } catch (error) {
    console.error('Database query error:', { text, error: error.message });
    throw error;
  }
}

/**
 * Get a client from the pool for transactions
 * @returns {Promise<Object>} Database client
 */
export async function getClient() {
  const client = await pool.connect();
  
  // Add query logging to client in development
  if (process.env.NODE_ENV === 'development') {
    const originalQuery = client.query.bind(client);
    client.query = async (...args) => {
      const start = Date.now();
      try {
        const result = await originalQuery(...args);
        const duration = Date.now() - start;
        console.log('Client query', { text: args[0], duration, rows: result.rowCount });
        return result;
      } catch (error) {
        console.error('Client query error:', { text: args[0], error: error.message });
        throw error;
      }
    };
  }
  
  return client;
}

/**
 * Execute a function within a database transaction
 * @param {Function} callback - Async function that receives the client
 * @returns {Promise<any>} Result from callback
 */
export async function transaction(callback) {
  const client = await getClient();
  
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Transaction error:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Execute multiple queries in a transaction
 * @param {Array<{text: string, params: Array}>} queries - Array of query objects
 * @returns {Promise<Array>} Array of query results
 */
export async function batchQuery(queries) {
  return transaction(async (client) => {
    const results = [];
    for (const { text, params = [] } of queries) {
      const result = await client.query(text, params);
      results.push(result);
    }
    return results;
  });
}

/**
 * Check if database connection is healthy
 * @returns {Promise<boolean>} True if connection is healthy
 */
export async function healthCheck() {
  try {
    const result = await query('SELECT NOW()');
    return result.rows.length > 0;
  } catch (error) {
    console.error('Database health check failed:', error.message);
    return false;
  }
}

export default {
  query,
  getClient,
  transaction,
  batchQuery,
  healthCheck
};
