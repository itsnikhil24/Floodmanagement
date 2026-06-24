import crypto from "crypto";
import redis  from "../config/redisClient.js";


const CACHE_TTL = parseInt(process.env.CACHE_TTL_SECONDS || "86400", 10);


function normalizeQuery(query) {
  return query.trim().toLowerCase().replace(/\s+/g, " ");
}


function responseKey(userId, query) {
  const raw  = `${userId}:${normalizeQuery(query)}`;
  const hash = crypto.createHash("sha256").update(raw).digest("hex");
  return `floodguard:response:${hash}`;
}

function userSetKey(userId) {
  return `floodguard:user:${userId}:keys`;
}


export async function get(userId, query) {
  try {
    const key  = responseKey(userId, query);
    const data = await redis.get(key);

    if (data) {
      // console.log(`[Cache HIT]  key=…${key.slice(-12)}`);
      return data;   
    }

    // console.log(`[Cache MISS] key=…${key.slice(-12)}`);
    return null;
  } catch (err) {
    console.error("[Cache get error]", err.message);
    return null;
  }
}


export async function set(userId, query, responseText) {
  try {
    const rKey = responseKey(userId, query);
    const uKey = userSetKey(userId);


    const pipeline = redis.pipeline();
    pipeline.set(rKey, responseText, "EX", CACHE_TTL); 
    pipeline.sadd(uKey, rKey);                          
    pipeline.expire(uKey, CACHE_TTL);                
    await pipeline.exec();

    // console.log(`[Cache SET]  key=…${rKey.slice(-12)} ttl=${CACHE_TTL}s`);
  } catch (err) {
    console.error("[Cache set error]", err.message);
    
  }
}

export async function invalidate(userId, query) {
  try {
    const rKey = responseKey(userId, query);
    const uKey = userSetKey(userId);

    const pipeline = redis.pipeline();
    pipeline.del(rKey);
    pipeline.srem(uKey, rKey); 
    await pipeline.exec();

    console.log(`[Cache DEL]  key=…${rKey.slice(-12)}`);
  } catch (err) {
    console.error("[Cache invalidate error]", err.message);
  }
}


export async function invalidateUser(userId) {
  try {
    const uKey = userSetKey(userId);
    const keys = await redis.smembers(uKey); 

    if (keys.length > 0) {
      await redis.del(...keys); 
    }
    await redis.del(uKey);

    console.log(`[Cache] Purged ${keys.length} entries for userId=${userId}`);
  } catch (err) {
    console.error("[Cache invalidateUser error]", err.message);
  }
}


export async function stats() {
  try {
    const raw    = await redis.info("stats");
    const parse  = (label) => {
      const m = raw.match(new RegExp(`${label}:(\\d+)`));
      return m ? parseInt(m[1], 10) : 0;
    };
    const hits   = parse("keyspace_hits");
    const misses = parse("keyspace_misses");
    return {
      totalCommandsProcessed:   parse("total_commands_processed"),
      totalConnectionsReceived: parse("total_connections_received"),
      keyspaceHits:   hits,
      keyspaceMisses: misses,
      hitRate: hits + misses === 0
        ? "0%"
        : `${((hits / (hits + misses)) * 100).toFixed(1)}%`,
    };
  } catch (err) {
    console.error("[Cache stats error]", err.message);
    return null;
  }
}