const express = require("express");
const fs = require("fs");

const DB_FILE = "./database.json";

// ===============================
// LOAD / INIT DATABASE
// ===============================

let db = { users: {}, sessions: {} };

if (fs.existsSync(DB_FILE)) {
    try {
        db = JSON.parse(fs.readFileSync(DB_FILE));
        if (!db.users) db.users = {};
        if (!db.sessions) db.sessions = {};
    } catch {
        db = { users: {}, sessions: {} };
    }
}


function saveDB() {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}




const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());


app.get("/1/profile/:userid", (req, res) => {
    console.log("GET Called: /1/profile/:userid");
    const userid = req.params.userid;
    if (!db.users[userid]) return res.status(404).json({ error: "Not found" });

    res.json(db.users[userid]);
});

app.get("/1/garage/:userid", (req, res) => {
    console.log("GET Called: /1/garage/:userid");
    const userid = req.params.userid;
    if (!db.users[userid]) return res.status(404).json({ error: "Not found" });

    res.json(db.users[userid].garage);
});

app.get("/1/store/:userid", (req, res) => {
    const userid = req.params.userid;
    if (!db.users[userid]) return res.status(404).json({ error: "Not found" });

    res.json({ store: "ok", items: [] });
});

app.get("/1/username-check/:username", (req, res) => {
    console.log("GET Called: /1/username-check");
    const username = req.params.username;
    if (!username) return res.status(404).json({ error: "Not found" });

    const userid = username.toLowerCase();
    const exists = !!db.users[userid];

    res.json({
        username,
        available: !exists
    });
});

app.get("/1/username-check", (req, res) => {
    console.log("GET Called: /1/username-check");
    const username = req.query.username;
    if (!username) return res.status(404).json({ error: "Not found" });

    const userid = username.toLowerCase();
    const exists = !!db.users[userid];

    res.json({
        username,
        available: !exists
    });
});

app.post("/1/users", (req, res) => {
    console.log("POST Called: /1/users");
    const {
        username,
        email,
        password,
        dob,
        gender,
        given_name,
        family_name,
        player_id,
        created_by_app_name,
        created_by_app_platform,
        created_by_app_version,
        email_lang
    } = req.body;

    if (!username || !email || !password || !player_id) {
        return res.status(400).json({ error: "Missing required fields" });
    }

    const userid = username.toLowerCase();

    if (db.users[userid]) {
        return res.status(409).json({ error: "User already exists" });
    }

    const now = new Date().toISOString();
    // Create user
    db.users[userid] = {
        userid,
        username,
        email,
        password,
        dob,
        gender,
        given_name,
        family_name,
        player_id,
        user_id: crypto.randomUUID(),
        created_by_app_name,
        created_by_app_platform,
        created_by_app_version,
        time_created: now,
        time_updated: now,
        email_lang,
        email_is_verified: true,
        xp: 0,
        level: 1,
        coins: 0,
        garage: {
            cars: [
                { id: "car_01", xp: 0, level: 1, speed: 5, handling: 5, boost: 5 }
            ]
        }
    };

    saveDB();

    res.json({
        status: "ok",
        userid,
        username,
        email,
        profile: db.users[userid]
    });
});

app.post("/1/sessions", (req, res) => {
    console.log("POST Called: /1/sessions");
    const body = req.body || {};

    const username = body.username;
    const password = body.password;

    if (!username || !password) {
        return res.status(400).json({ error: "Missing username or password" });
    }

    const userid = username.toLowerCase();
    const user = db.users[userid];

    if (!user) {
        return res.status(404).json({ error: "User not found" });
    }

    if (user.password !== password) {
        console.log("Wrong Password");
        return res.status(401).json({ error: "Invalid credentials" });
        
    }

    // Create session token
    const session_token = crypto.randomUUID();
    db.sessions[userid] = {
        session_token,
        start: Date.now(),
        expire: "never"
    };

    saveDB();

    res.json({
        account: {
            session: {
                scope: "user",
                session_token,
                time_expires: "never"
            },
            user: {
                created_by_app_name: user.created_by_app_name || "overdrive",
                created_by_app_platform: user.created_by_app_platform || "Android",
                created_by_app_version: user.created_by_app_version || "3.4.0",
                dob: user.dob,
                email: user.email,
                email_is_verified: true,
                password: user.password,
                player_id: user.player_id,
                status: "active",
                time_created: user.time_created || new Date().toISOString(),
                time_updated: user.time_updated || new Date().toISOString(),
                user_id: user.user_id,
                username: user.username
            }
        }
    });
});

app.get("/1/overdrive/players/:user_id", (req, res) => {
    const user_id = req.params.user_id;
    console.log("GET Called: /1/overdrive/players/:user_id");

    const user = Object.values(db.users).find(u => u.user_id === user_id);
    if (!user) return res.status(404).json({ error: "Not found" });

    const etag = user.profile_etag || "";
    const md5 = user.profile_md5 || "";
    const creationDateSec = Math.floor(new Date(user.time_created).getTime() / 1000);

    res.json({
        data: {
            "int-coins": user.coins || 0,
            "int-created-by-overdrive": 1,
            "int-creationDateSec": creationDateSec,
            "int-distance_driven_mm": user.distance_driven_mm || 0,
            "int-games_completed": user.games_completed || 0,
            "int-onlineVersion": 0,
            "int-points_earned": user.xp || 0,
            "int-points_spent": user.points_spent || 0,
            "int-version": 1,
            "str-etag": etag,
            "str-md5": md5,
            "str-name": user.username || "Guest",
            "str-profile_id": user.user_id
        },
        metadata: {
            "doc-version": 0,
            "etag": etag,
            "key": user.user_id,
            "last-updated": user.time_updated || new Date().toISOString()
        }
    });
});




app.post("/1/overdrive/players/:user_id", (req, res) => {
    const user_id = req.params.user_id;
    const body = req.body || {};

    const user = Object.values(db.users).find(u => u.user_id === user_id);
    if (!user) return res.status(404).json({ error: "Not found" });

    const update = body.update || {};

    // Sync MD5
    if (update["str_rpl-md5"]) {
        user.profile_md5 = update["str_rpl-md5"];
        user.profile_etag = update["str_rpl-md5"];   // CRITICAL FIX
    }

    // If name was not sent, KEEP existing name
    if (update["str_rpl-name"]) {
        user.username = update["str_rpl-name"];
    }

    // If name missing, DO NOT overwrite it
    // (real cloud keeps name stable)

    // Keep other fields stable
    user.time_updated = new Date().toISOString();
    saveDB();

    res.json({ status: "ok" });
});

app.get("/1/users/:user_id", (req, res) => {
    const user_id = req.params.user_id;
    console.log("GET Called: /1/users/:user_id");

    const user = Object.values(db.users).find(u => u.user_id === user_id);

    if (!user) {
        return res.status(404).json({ error: "Not found" });
    }

    res.json({
        created_by_app_name: user.created_by_app_name || "overdrive",
        created_by_app_platform: user.created_by_app_platform || "Android",
        created_by_app_version: user.created_by_app_version || "3.4.0",

        dob: user.dob,
        email: user.email,
        email_is_verified: user.email_is_verified,

        password: user.password,
        player_id: user.player_id,
        status: "active",

        time_created: user.time_created,
        time_updated: user.time_updated,

        user_id: user.user_id,
        username: user.username
    });
});

app.post("/1/overdrive/players/:user_id/rpl", (req, res) => {
    console.log("POST Called: /1/overdrive/players/:user_id/rpl");
    const user_id = req.params.user_id;
    const body = req.body || {};

    const user = Object.values(db.users).find(u => u.user_id === user_id);
    if (!user) return res.status(404).json({ error: "Not found" });

    // Save the entire RPL document
    user.rpl = body.update || {};
    user.rpl_last_updated = new Date().toISOString();

    saveDB();

    res.json({ status: "ok" });
});

app.get("/1/overdrive/players/:user_id/rpl", (req, res) => {
    console.log("GET Called: /1/overdrive/players/:user_id/rpl");
    const user_id = req.params.user_id;

    const user = Object.values(db.users).find(u => u.user_id === user_id);
    if (!user) return res.status(404).json({ error: "Not found" });

    // If no RPL exists, return empty document (game shows "Not Synced")
    const rpl = user.rpl || {};

    res.json({
        client_id: user.client_id || "ffffffff-b313-f4de-c189-ce090033c587",
        txn_id: crypto.randomUUID(),
        update: rpl
    });
});

app.get("/1/:gg/applepay-cfg", (req, res) => {
    res.json({ enabled: false });
});

app.get("/1/:gg/catalog", (req, res) => {
    res.json({
	"products": [
		{
			"app_id": "overdrive",
			"categories": [
				{
					"display_name": "Overdrive",
					"name": "overdriveapp"
				},
				{
					"display_name": "Starter Kits",
					"name": "kit"
				}
			],
			"desc": "The Anki OVERDRIVE Starter Kit includes everything you need to begin",
			"final_price": {
				"formatted": "$149.99"
			},
			"icon": {
				"url": ""
			},
			"in_stock": true,
			"is_saleable": true,
			"max_count": 10,
			"name": "Anki OVERDRIVE Starter Kit",
			"on_sale": false,
			"price": {
				"formatted": "$149.99"
			},
			"short_desc": "Complete racing starter kit",
			"sku": "000-00001",
			"vskus": []
		},
		{
			"app_id": "overdrive",
			"categories": [
				{
					"display_name": "Overdrive",
					"name": "overdriveapp"
				},
				{
					"display_name": "OpenOverdrive",
					"name": "car"
				}
			],
			"desc": "Open‑source Overdrive server project that restores online functionality for Anki OVERDRIVE.  Fully community‑maintained and available on GitHub: https://github.com/WhoopFPV/OpenOverdrive",
			"final_price": {
				"formatted": "Version 1"
			},
			"icon": {
				"url": "https://raw.githubusercontent.com/WhoopFPV/OpenOverdrive/2c29b7500fe9079a2decb913f7112daebf481643/assets/logo.png"
			},
			"in_stock": true,
			"is_saleable": false,
			"max_count": 99,
			"name": "OpenOverdrive",
			"on_sale": false,
			"price": {
				"formatted": "$99999999999999999.99"
			},
			"short_desc": "https://github.com/WhoopFPV/OpenOverdrive",
			"sku": "000-00002",
			"vskus": []
		},
        {
			"app_id": "overdrive",
			"categories": [
				{
					"display_name": "Overdrive",
					"name": "overdriveapp"
				},
				{
					"display_name": "Cozmo",
					"name": "cozmo"
				}
			],
			"desc": "Didnt know how to get any other tabs working, sorry",
			"final_price": {
				"formatted": "$180.00"
			},
			"icon": {
				"url": "https://raw.githubusercontent.com/WhoopFPV/OpenOverdrive/2c29b7500fe9079a2decb913f7112daebf481643/assets/CozmoTab.png"
			},
			"in_stock": true,
			"is_saleable": true,
			"max_count": 99,
			"name": "OpenOverdrive",
			"on_sale": true,
			"price": {
				"formatted": "$69"
			},
			"short_desc": "PLEASE HELP ME GET THE OTHER TABS + SYNCING WORKING PLEASE!!!\nhttps://github.com/WhoopFPV/OpenOverdrive",
			"sku": "000-00003",
			"vskus": []
		},
        
	]
});
});

app.get("/prod/manifest/od-homepagepromo-android/2/en_us/manifest.json", (req, res) => {
    res.json({
        "promo": {
            "title": "OpenOverdrive",
            "subtitle": "Open-source Overdrive cloud server",
            "description": "Restore online functionality for Anki OVERDRIVE.\nCommunity-maintained and free.\nhttps://github.com/whoopfpv/OpenOverdrive",
            "image": "https://raw.githubusercontent.com/WhoopFPV/OpenOverdrive/2c29b7500fe9079a2decb913f7112daebf481643/assets/CozmoTab.png",
            "button_text": "View on GitHub",
            "button_link": "https://github.com/whoopfpv/OpenOverdrive",
            "expires": 4102444800
        }
    });
});

app.get("/prod/manifest/overdrive-android/3.4.0/en_us/manifest.json", (req, res) => {
    res.json({
        "config": {
            "version": "3.4.0",
            "region": "en_us",
            "features": {
            "store_enabled": false,
            "promo_enabled": true,
            "experiments_enabled": true,
            "garage_sync": true,
            "cloud_profile": true
            },
            "experiments": [],
            "promo": {
            "enabled": true,
            "manifest": "/prod/manifest/od-homepagepromo-android/2/en_us/manifest.json"
            }
        }
    });
});

app.get("/prod/manifest/experiments-android/3.4.0/en_us/tag.8e5a90cf41.json", (req, res) => {
    res.json({ experiments: [] });
});

// Put dumped rams here!

app.use((req, res) => {
    const info = {
        path: req.originalUrl,
        method: req.method,
        params: req.params,
        query: req.query,
        body: req.body,
        auth: req.headers.authorization
    };

    console.log(`Endpoint "${req.originalUrl}" doesn't exist! Data passed with it:`, info);

    res.status(404).json({ error: "Not found" });
});




app.listen(80, () => {
    console.log("OpenOverdrive Running on port 80");
});