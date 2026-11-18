package com.lavo.gaminghub;

import android.app.NotificationManager;
import android.content.ContentResolver;
import android.content.Context;
import android.content.SharedPreferences;
import android.hardware.display.DisplayManager;
import android.os.Build;
import android.provider.Settings;
import android.view.Display;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;

import org.json.JSONObject;

/**
 * Applies a game's saved configuration and restores the original device settings afterwards.
 * Every change is recorded in the session snapshot first, so restoring survives the app being killed.
 */
public final class SettingsApplier {
    private static final String MIN_RR = "min_refresh_rate";
    private static final String PEAK_RR = "peak_refresh_rate";

    private SettingsApplier() {
    }

    /* ---------- permission checks ---------- */

    public static boolean canWriteSettings(Context c) {
        return Build.VERSION.SDK_INT < 23 || Settings.System.canWrite(c);
    }

    public static boolean canDrawOverlays(Context c) {
        return Build.VERSION.SDK_INT < 23 || Settings.canDrawOverlays(c);
    }

    public static boolean hasDndAccess(Context c) {
        if (Build.VERSION.SDK_INT < 23) {
            return true;
        }
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        return nm != null && nm.isNotificationPolicyAccessGranted();
    }

    /* ---------- apply ---------- */

    public static JSObject apply(Context ctx, GameConfigStore store, String pkg, JSONObject cfg) {
        JSArray applied = new JSArray();
        JSArray skipped = new JSArray();
        SharedPreferences sp = store.session();
        ContentResolver cr = ctx.getContentResolver();
        long now = System.currentTimeMillis();

        if (!sp.getBoolean("active", false)) {
            // Take the snapshot BEFORE changing anything. commit() so it is on disk immediately.
            sp.edit().clear()
                    .putBoolean("active", true)
                    .putString("pkg", pkg)
                    .putLong("launchedAt", now)
                    .putInt("brightness", Settings.System.getInt(cr, Settings.System.SCREEN_BRIGHTNESS, 128))
                    .putInt("brightnessMode", Settings.System.getInt(cr, Settings.System.SCREEN_BRIGHTNESS_MODE,
                            Settings.System.SCREEN_BRIGHTNESS_MODE_AUTOMATIC))
                    .putInt("timeout", Settings.System.getInt(cr, Settings.System.SCREEN_OFF_TIMEOUT, 60000))
                    .putFloat("minRr", Settings.System.getFloat(cr, MIN_RR, -1f))
                    .putFloat("peakRr", Settings.System.getFloat(cr, PEAK_RR, -1f))
                    .commit();
        } else {
            sp.edit().putString("pkg", pkg).putLong("launchedAt", now).commit();
        }

        // FPS Boost: Android cannot force a game's frame rate. The most an app can do is ask the
        // system to keep the display at its highest refresh rate (honoured on many devices, ignored on some).
        if (cfg.optBoolean("fpsBoost", false)) {
            if (!canWriteSettings(ctx)) {
                skipped.put("FPS Boost needs 'Modify system settings'");
            } else {
                try {
                    float hz = maxRefreshRate(ctx);
                    if (hz > 0f) {
                        Settings.System.putFloat(cr, MIN_RR, hz);
                        if (sp.getFloat("peakRr", -1f) >= 0f) {
                            Settings.System.putFloat(cr, PEAK_RR, hz);
                        }
                        sp.edit().putBoolean("chRefresh", true).commit();
                        applied.put("Refresh rate set to " + Math.round(hz) + " Hz");
                    } else {
                        skipped.put("FPS Boost: could not read the display's refresh rates");
                    }
                } catch (SecurityException e) {
                    skipped.put("FPS Boost was blocked by the system");
                }
            }
        }

        int brightness = cfg.optInt("brightness", -1);
        if (brightness >= 0) {
            if (!canWriteSettings(ctx)) {
                skipped.put("Brightness needs 'Modify system settings'");
            } else {
                try {
                    Settings.System.putInt(cr, Settings.System.SCREEN_BRIGHTNESS_MODE,
                            Settings.System.SCREEN_BRIGHTNESS_MODE_MANUAL);
                    Settings.System.putInt(cr, Settings.System.SCREEN_BRIGHTNESS, brightness);
                    sp.edit().putBoolean("chBrightness", true).commit();
                    applied.put("Brightness set to " + Math.round(brightness * 100f / 255f) + "%");
                } catch (SecurityException e) {
                    skipped.put("Brightness was blocked by the system");
                }
            }
        }

        int minutes = cfg.optInt("screenTimeoutMin", 0);
        if (minutes > 0) {
            if (!canWriteSettings(ctx)) {
                skipped.put("Screen timeout needs 'Modify system settings'");
            } else {
                try {
                    Settings.System.putInt(cr, Settings.System.SCREEN_OFF_TIMEOUT, minutes * 60 * 1000);
                    sp.edit().putBoolean("chTimeout", true).commit();
                    applied.put("Screen stays on for " + minutes + " min");
                } catch (SecurityException e) {
                    skipped.put("Screen timeout was blocked by the system");
                }
            }
        }

        if (cfg.optBoolean("dnd", false)) {
            if (!hasDndAccess(ctx)) {
                skipped.put("Do Not Disturb needs 'Do Not Disturb access'");
            } else {
                try {
                    NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
                    if (nm != null) {
                        if (!sp.getBoolean("chDnd", false)) {
                            sp.edit().putInt("dndBefore", nm.getCurrentInterruptionFilter()).commit();
                        }
                        nm.setInterruptionFilter(NotificationManager.INTERRUPTION_FILTER_ALARMS);
                        sp.edit().putBoolean("chDnd", true).commit();
                        applied.put("Do Not Disturb on (alarms only)");
                    }
                } catch (SecurityException e) {
                    skipped.put("Do Not Disturb was blocked by the system");
                }
            }
        }

        JSObject res = new JSObject();
        res.put("applied", applied);
        res.put("skipped", skipped);
        return res;
    }

    /* ---------- restore ---------- */

    public static JSObject restore(Context ctx, GameConfigStore store) {
        JSArray restored = new JSArray();
        JSObject res = new JSObject();
        SharedPreferences sp = store.session();
        if (!sp.getBoolean("active", false)) {
            res.put("restored", restored);
            return res;
        }
        ContentResolver cr = ctx.getContentResolver();
        try {
            if (sp.getBoolean("chBrightness", false) && canWriteSettings(ctx)) {
                Settings.System.putInt(cr, Settings.System.SCREEN_BRIGHTNESS_MODE,
                        sp.getInt("brightnessMode", Settings.System.SCREEN_BRIGHTNESS_MODE_AUTOMATIC));
                Settings.System.putInt(cr, Settings.System.SCREEN_BRIGHTNESS, sp.getInt("brightness", 128));
                restored.put("Brightness");
            }
            if (sp.getBoolean("chTimeout", false) && canWriteSettings(ctx)) {
                Settings.System.putInt(cr, Settings.System.SCREEN_OFF_TIMEOUT, sp.getInt("timeout", 60000));
                restored.put("Screen timeout");
            }
            if (sp.getBoolean("chRefresh", false) && canWriteSettings(ctx)) {
                float min = sp.getFloat("minRr", -1f);
                Settings.System.putFloat(cr, MIN_RR, min >= 0f ? min : 0f);
                float peak = sp.getFloat("peakRr", -1f);
                if (peak >= 0f) {
                    Settings.System.putFloat(cr, PEAK_RR, peak);
                }
                restored.put("Refresh rate");
            }
            if (sp.getBoolean("chDnd", false) && hasDndAccess(ctx)) {
                NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
                // Only undo Do Not Disturb if the user has not changed it themselves in the meantime.
                if (nm != null && nm.getCurrentInterruptionFilter() == NotificationManager.INTERRUPTION_FILTER_ALARMS) {
                    nm.setInterruptionFilter(sp.getInt("dndBefore", NotificationManager.INTERRUPTION_FILTER_ALL));
                    restored.put("Do Not Disturb");
                }
            }
        } catch (SecurityException ignored) {
            // permission was revoked while the game was running; nothing more we can do
        }
        sp.edit().clear().commit();
        res.put("restored", restored);
        return res;
    }

    /* ---------- helpers ---------- */

    private static float maxRefreshRate(Context ctx) {
        float best = 0f;
        try {
            DisplayManager dm = (DisplayManager) ctx.getSystemService(Context.DISPLAY_SERVICE);
            Display d = dm == null ? null : dm.getDisplay(Display.DEFAULT_DISPLAY);
            if (d != null) {
                best = d.getRefreshRate();
                if (Build.VERSION.SDK_INT >= 23) {
                    for (Display.Mode m : d.getSupportedModes()) {
                        best = Math.max(best, m.getRefreshRate());
                    }
                }
            }
        } catch (Exception ignored) {
            // fall through with whatever we found
        }
        return best;
    }
}
