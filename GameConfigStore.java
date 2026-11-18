package com.lavo.gaminghub;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONException;
import org.json.JSONObject;

/**
 * Local storage for per-game settings (keyed by package name) and for the snapshot of the
 * device settings that was taken before a game was launched.
 */
public final class GameConfigStore {
    private static final String CONFIGS = "lavo_game_configs";
    private static final String SESSION = "lavo_game_session";

    private final SharedPreferences configs;
    private final SharedPreferences session;

    public GameConfigStore(Context context) {
        Context app = context.getApplicationContext();
        configs = app.getSharedPreferences(CONFIGS, Context.MODE_PRIVATE);
        session = app.getSharedPreferences(SESSION, Context.MODE_PRIVATE);
    }

    public static boolean validPackage(String pkg) {
        return pkg != null && pkg.matches("[A-Za-z0-9_.]{1,200}");
    }

    /** Defaults: nothing changes unless the user turns it on. */
    public static JSONObject defaults() {
        JSONObject o = new JSONObject();
        try {
            o.put("fpsBoost", false);        // ask for the highest display refresh rate
            o.put("dnd", false);             // Do Not Disturb (alarms only) while playing
            o.put("brightness", -1);         // -1 = leave unchanged, otherwise 0..255
            o.put("screenTimeoutMin", 0);    // 0 = leave unchanged, otherwise 1..30 minutes
            o.put("overlay", true);          // floating bubble
        } catch (JSONException ignored) {
            // cannot happen with constant keys
        }
        return o;
    }

    /** Keeps only known keys and clamps every value. */
    public static JSONObject sanitize(JSONObject in) {
        JSONObject o = defaults();
        if (in == null) {
            return o;
        }
        try {
            o.put("fpsBoost", in.optBoolean("fpsBoost", false));
            o.put("dnd", in.optBoolean("dnd", false));
            int b = in.optInt("brightness", -1);
            o.put("brightness", b < 0 ? -1 : Math.min(b, 255));
            int t = in.optInt("screenTimeoutMin", 0);
            o.put("screenTimeoutMin", Math.max(0, Math.min(t, 30)));
            o.put("overlay", in.optBoolean("overlay", true));
        } catch (JSONException ignored) {
            // cannot happen with constant keys
        }
        return o;
    }

    public JSONObject get(String pkg) {
        String s = configs.getString("cfg_" + pkg, null);
        if (s == null) {
            return defaults();
        }
        try {
            return sanitize(new JSONObject(s));
        } catch (JSONException e) {
            return defaults();
        }
    }

    public void save(String pkg, JSONObject cfg) {
        configs.edit().putString("cfg_" + pkg, sanitize(cfg).toString()).apply();
    }

    /** Snapshot and bookkeeping for the game session that is currently running. */
    public SharedPreferences session() {
        return session;
    }

    public boolean sessionActive() {
        return session.getBoolean("active", false);
    }
}
