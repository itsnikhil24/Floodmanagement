
import Redis from "ioredis";
import dotenv from "dotenv";
dotenv.config();



const redisConfig = process.env.REDIS_URL
    ? {

        lazyConnect: false,
    }
    : {
        host: process.env.REDIS_HOST || "127.0.0.1",
        port: parseInt(process.env.REDIS_PORT || "6379", 10),
        password: process.env.REDIS_PASSWORD || undefined,
        db: parseInt(process.env.REDIS_DB || "0", 10),
        lazyConnect: false,
    };


redisConfig.retryStrategy = (times) => {
    if (times > 10) {
        console.error(`[Redis] Gave up reconnecting after ${times} attempts.`);
        return null;
    }
    const delay = Math.min(times * 200, 3000);
    console.warn(`[Redis] Reconnecting… attempt ${times}, waiting ${delay}ms`);
    return delay;
};


const redis = process.env.REDIS_URL
    ? new Redis(process.env.REDIS_URL, redisConfig)
    : new Redis(redisConfig);


redis.on("connect", () => console.log("[Redis] TCP connection established"));
redis.on("ready", () => console.log("[Redis] Client ready — commands can flow"));
redis.on("error", (err) => console.error("[Redis] Error:", err.message));
redis.on("close", () => console.warn("[Redis] Connection closed"));
redis.on("reconnecting", (ms) => console.warn(`[Redis] Reconnecting in ${ms}ms…`));
redis.on("end", () => console.warn("[Redis] Connection ended (no more reconnects)"));


export async function closeRedis() {
    await redis.quit();
    console.log("[Redis] Connection gracefully closed");
}

export default redis;