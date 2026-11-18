package com.lavo.gaminghub;

import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.drawable.Drawable;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.util.Base64;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

@CapacitorPlugin(name = "Lavo")
public class LavoPlugin extends Plugin {

    /* ---------- helpers ---------- */

    private boolean isGame(ApplicationInfo ai) {
        if (Build.VERSION.SDK_INT >= 26 && ai.category == ApplicationInfo.CATEGORY_GAME) {
            return true;
        }
        return (ai.flags & ApplicationInfo.FLAG_IS_GAME) != 0;
    }

    private String installer(PackageManager pm, String pkg) {
        String inst = null;
        try {
            if (Build.VERSION.SDK_INT >= 30) {
                inst = pm.getInstallSourceInfo(pkg).getInstallingPackageName();
            } else {
                inst = pm.getInstallerPackageName(pkg);
            }
        } catch (Exception e) {
            inst = null;
        }
        return inst == null ? "" : inst;
    }

    private String icon(PackageManager pm, ApplicationInfo ai) {
        try {
            Drawable d = pm.getApplicationIcon(ai);
            int s = 80;
            Bitmap b = Bitmap.createBitmap(s, s, Bitmap.Config.ARGB_8888);
            Canvas c = new Canvas(b);
            d.setBounds(0, 0, s, s);
            d.draw(c);
            ByteArrayOutputStream bo = new ByteArrayOutputStream();
            b.compress(Bitmap.CompressFormat.PNG, 100, bo);
            return "data:image/png;base64," + Base64.encodeToString(bo.toByteArray(), Base64.NO_WRAP);
        } catch (Exception e) {
            return "";
        }
    }

    private String label(String pkg) {
        try {
            PackageManager pm = getContext().getPackageManager();
            return String.valueOf(pm.getApplicationLabel(pm.getApplicationInfo(pkg, 0)));
        } catch (Exception e) {
            return pkg;
        }
    }

    /** Launchable apps. gamesOnly keeps only ApplicationInfo.CATEGORY_GAME apps (and the legacy game flag). */
    private JSArray query(boolean gamesOnly) {
        Context ctx = getContext();
        PackageManager pm = ctx.getPackageManager();
        Intent main = new Intent(Intent.ACTION_MAIN, null);
        main.addCategory(Intent.CATEGORY_LAUNCHER);
        List<ResolveInfo> list = pm.queryIntentActivities(main, 0);
        GameConfigStore store = new GameConfigStore(ctx);
        JSArray out = new JSArray();
        Set<String> seen = new HashSet<String>();
        String self = ctx.getPackageName();
        for (ResolveInfo ri : list) {
            ApplicationInfo ai = ri.activityInfo.applicationInfo;
            String pkg = ai.packageName;
            if (pkg.equals(self) || !seen.add(pkg)) {
                continue;
            }
            boolean game = isGame(ai);
            if (gamesOnly && !game) {
                continue;
            }
            JSObject o = new JSObject();
            o.put("pkg", pkg);
            o.put("name", String.valueOf(pm.getApplicationLabel(ai)));
            o.put("game", game);
            o.put("store", installer(pm, pkg));
            if (game) {
                o.put("icon", icon(pm, ai));
                o.put("config", store.get(pkg));
            }
            out.put(o);
        }
        return out;
    }

    /* ---------- 1. query installed games ---------- */

    @PluginMethod
    public void listApps(PluginCall call) {
        try {
            JSObject res = new JSObject();
            res.put("apps", query(false));
            call.resolve(res);
        } catch (Exception e) {
            call.reject("Could not list apps: " + e.getMessage());
        }
    }

    @PluginMethod
    public void listGames(PluginCall call) {
        try {
            JSObject res = new JSObject();
            res.put("games", query(true));
            call.resolve(res);
        } catch (Exception e) {
            call.reject("Could not list games: " + e.getMessage());
        }
    }

    /* ---------- 2. per-game configuration ---------- */

    @PluginMethod
    public void getConfig(PluginCall call) {
        String pkg = call.getString("pkg");
        if (!GameConfigStore.validPackage(pkg)) {
            call.reject("Invalid package name");
            return;
        }
        JSObject res = new JSObject();
        res.put("config", new GameConfigStore(getContext()).get(pkg));
        call.resolve(res);
    }

    @PluginMethod
    public void saveConfig(PluginCall call) {
        String pkg = call.getString("pkg");
        JSObject cfg = call.getObject("config");
        if (!GameConfigStore.validPackage(pkg) || cfg == null) {
            call.reject("Invalid package name or configuration");
            return;
        }
        GameConfigStore store = new GameConfigStore(getContext());
        store.save(pkg, cfg);
        JSObject res = new JSObject();
        res.put("config", store.get(pkg));
        call.resolve(res);
    }

    /* ---------- 3. permission handler ---------- */

    @PluginMethod
    public void permissionStatus(PluginCall call) {
        Context ctx = getContext();
        JSObject res = new JSObject();
        res.put("writeSettings", SettingsApplier.canWriteSettings(ctx));
        res.put("notificationPolicy", SettingsApplier.hasDndAccess(ctx));
        res.put("overlay", SettingsApplier.canDrawOverlays(ctx));
        call.resolve(res);
    }

    /**
     * These three are special permissions: Android has no pop-up for them. The user has to switch
     * them on in a system settings screen, so this opens the right screen. Check permissionStatus
     * again when the app comes back.
     */
    @PluginMethod
    public void requestPermission(PluginCall call) {
        String name = call.getString("name");
        Context ctx = getContext();
        Intent i;
        if ("writeSettings".equals(name)) {
            i = new Intent(Settings.ACTION_MANAGE_WRITE_SETTINGS, Uri.parse("package:" + ctx.getPackageName()));
        } else if ("overlay".equals(name)) {
            i = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + ctx.getPackageName()));
        } else if ("notificationPolicy".equals(name)) {
            i = new Intent(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS);
        } else {
            call.reject("Unknown permission");
            return;
        }
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            ctx.startActivity(i);
            call.resolve();
        } catch (ActivityNotFoundException e) {
            call.reject("This settings screen is not available on your device");
        }
    }

    /* ---------- 4. launch with the saved configuration ---------- */

    @PluginMethod
    public void launchGame(PluginCall call) {
        String pkg = call.getString("pkg");
        if (!GameConfigStore.validPackage(pkg)) {
            call.reject("Invalid package name");
            return;
        }
        Context ctx = getContext();
        Intent launch = ctx.getPackageManager().getLaunchIntentForPackage(pkg);
        if (launch == null) {
            call.reject("This game cannot be opened. Is it still installed?");
            return;
        }
        GameConfigStore store = new GameConfigStore(ctx);
        JSONObject cfg = store.get(pkg);

        // 1) apply this game's saved configuration
        JSObject report = SettingsApplier.apply(ctx, store, pkg, cfg);

        // 2) start the floating bubble
        boolean bubble = false;
        if (cfg.optBoolean("overlay", true)) {
            if (SettingsApplier.canDrawOverlays(ctx)) {
                OverlayService.start(ctx, label(pkg));
                bubble = true;
            } else {
                JSONArray skipped = report.optJSONArray("skipped");
                if (skipped != null) {
                    skipped.put("Floating bubble needs 'Display over other apps'");
                }
            }
        }
        report.put("bubble", bubble);

        // 3) launch the game
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            ctx.startActivity(launch);
        } catch (Exception e) {
            SettingsApplier.restore(ctx, store);
            OverlayService.stop(ctx);
            call.reject("Could not launch the game: " + e.getMessage());
            return;
        }
        call.resolve(report);
    }

    /* ---------- 5. restore the original settings ---------- */

    @PluginMethod
    public void restoreSettings(PluginCall call) {
        Context ctx = getContext();
        JSObject res = SettingsApplier.restore(ctx, new GameConfigStore(ctx));
        OverlayService.stop(ctx);
        call.resolve(res);
    }

    /** Called when LavO comes back to the foreground, for example after the game is closed. */
    @Override
    protected void handleOnResume() {
        super.handleOnResume();
        try {
            Context ctx = getContext();
            GameConfigStore store = new GameConfigStore(ctx);
            SharedPreferences sp = store.session();
            if (!sp.getBoolean("active", false)) {
                return;
            }
            // Ignore the resume that can happen while the game is still starting.
            if (System.currentTimeMillis() - sp.getLong("launchedAt", 0L) < 1500L) {
                return;
            }
            JSObject report = SettingsApplier.restore(ctx, store);
            OverlayService.stop(ctx);
            notifyListeners("sessionEnded", report, true);
        } catch (Exception ignored) {
            // never crash the app because of a restore problem
        }
    }
}
