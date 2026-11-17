package com.lavo.gaminghub;

import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.drawable.Drawable;
import android.os.Build;
import android.util.Base64;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

@CapacitorPlugin(name = "Lavo")
public class LavoPlugin extends Plugin {

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

    @PluginMethod
    public void listApps(PluginCall call) {
        try {
            PackageManager pm = getContext().getPackageManager();
            Intent main = new Intent(Intent.ACTION_MAIN, null);
            main.addCategory(Intent.CATEGORY_LAUNCHER);
            List<ResolveInfo> list = pm.queryIntentActivities(main, 0);
            JSArray out = new JSArray();
            Set<String> seen = new HashSet<String>();
            String self = getContext().getPackageName();
            for (ResolveInfo ri : list) {
                ApplicationInfo ai = ri.activityInfo.applicationInfo;
                String pkg = ai.packageName;
                if (pkg.equals(self) || !seen.add(pkg)) {
                    continue;
                }
                boolean game = isGame(ai);
                JSObject o = new JSObject();
                o.put("pkg", pkg);
                o.put("name", String.valueOf(pm.getApplicationLabel(ai)));
                o.put("game", game);
                o.put("store", installer(pm, pkg));
                if (game) {
                    o.put("icon", icon(pm, ai));
                }
                out.put(o);
            }
            JSObject res = new JSObject();
            res.put("apps", out);
            call.resolve(res);
        } catch (Exception e) {
            call.reject("Could not list apps: " + e.getMessage());
        }
    }

    @PluginMethod
    public void launch(PluginCall call) {
        String pkg = call.getString("pkg");
        if (pkg == null || !pkg.matches("[A-Za-z0-9_.]+")) {
            call.reject("Invalid package name");
            return;
        }
        Intent i = getContext().getPackageManager().getLaunchIntentForPackage(pkg);
        if (i == null) {
            call.reject("This app cannot be opened. Is it still installed?");
            return;
        }
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(i);
        call.resolve();
    }
}
