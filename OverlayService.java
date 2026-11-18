package com.lavo.gaminghub;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.PixelFormat;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.IBinder;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewConfiguration;
import android.view.WindowManager;
import android.widget.TextView;

/**
 * Lightweight floating bubble shown while a game runs. Drag it anywhere; tap it to return to LavO
 * (which also restores the original device settings). Runs as a foreground service so Android keeps it alive.
 */
public class OverlayService extends Service {
    public static final String EXTRA_NAME = "name";
    private static final String CHANNEL_ID = "lavo_overlay";
    private static final int NOTIFICATION_ID = 4711;

    private WindowManager wm;
    private View bubble;

    public static void start(Context ctx, String name) {
        Intent i = new Intent(ctx, OverlayService.class).putExtra(EXTRA_NAME, name);
        if (Build.VERSION.SDK_INT >= 26) {
            ctx.startForegroundService(i);
        } else {
            ctx.startService(i);
        }
    }

    public static void stop(Context ctx) {
        ctx.stopService(new Intent(ctx, OverlayService.class));
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String name = intent == null ? null : intent.getStringExtra(EXTRA_NAME);
        goForeground(name == null ? "your game" : name);
        if (!SettingsApplier.canDrawOverlays(this)) {
            stopSelf();
            return START_NOT_STICKY;
        }
        if (bubble == null) {
            addBubble();
        }
        return START_NOT_STICKY;
    }

    private void goForeground(String name) {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26 && nm != null) {
            nm.createNotificationChannel(new NotificationChannel(CHANNEL_ID, "Game boost", NotificationManager.IMPORTANCE_LOW));
        }
        Intent open = getPackageManager().getLaunchIntentForPackage(getPackageName());
        PendingIntent pi = null;
        if (open != null) {
            int flags = Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0;
            pi = PendingIntent.getActivity(this, 0, open, flags);
        }
        Notification.Builder b = Build.VERSION.SDK_INT >= 26
                ? new Notification.Builder(this, CHANNEL_ID)
                : new Notification.Builder(this);
        b.setSmallIcon(android.R.drawable.ic_media_play)
                .setContentTitle("LavO game boost")
                .setContentText("Active for " + name + ". Tap to return.")
                .setOngoing(true);
        if (pi != null) {
            b.setContentIntent(pi);
        }
        Notification n = b.build();
        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(NOTIFICATION_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        } else {
            startForeground(NOTIFICATION_ID, n);
        }
    }

    private int dp(int v) {
        return (int) (v * getResources().getDisplayMetrics().density + 0.5f);
    }

    private void addBubble() {
        wm = (WindowManager) getSystemService(Context.WINDOW_SERVICE);
        TextView v = new TextView(this);
        v.setText("\u26A1");
        v.setTextSize(22);
        v.setGravity(Gravity.CENTER);
        v.setTextColor(0xFFF2F2F2);
        v.setContentDescription("Return to LavO");
        GradientDrawable bg = new GradientDrawable();
        bg.setShape(GradientDrawable.OVAL);
        bg.setColor(0xE6131314);
        bg.setStroke(dp(1), 0xFF3A3A3E);
        v.setBackground(bg);

        int type = Build.VERSION.SDK_INT >= 26
                ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                : WindowManager.LayoutParams.TYPE_PHONE;
        final WindowManager.LayoutParams lp = new WindowManager.LayoutParams(
                dp(52), dp(52), type,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
                PixelFormat.TRANSLUCENT);
        lp.gravity = Gravity.TOP | Gravity.START;
        lp.x = dp(8);
        lp.y = dp(160);
        final int slop = ViewConfiguration.get(this).getScaledTouchSlop();

        v.setOnTouchListener(new View.OnTouchListener() {
            private int startX;
            private int startY;
            private float touchX;
            private float touchY;
            private boolean moved;

            @Override
            public boolean onTouch(View view, MotionEvent e) {
                switch (e.getAction()) {
                    case MotionEvent.ACTION_DOWN:
                        startX = lp.x;
                        startY = lp.y;
                        touchX = e.getRawX();
                        touchY = e.getRawY();
                        moved = false;
                        return true;
                    case MotionEvent.ACTION_MOVE: {
                        float dx = e.getRawX() - touchX;
                        float dy = e.getRawY() - touchY;
                        if (Math.abs(dx) > slop || Math.abs(dy) > slop) {
                            moved = true;
                        }
                        lp.x = startX + (int) dx;
                        lp.y = startY + (int) dy;
                        try {
                            wm.updateViewLayout(view, lp);
                        } catch (Exception ignored) {
                            // view was removed
                        }
                        return true;
                    }
                    case MotionEvent.ACTION_UP:
                        if (!moved) {
                            openLavo();
                        }
                        return true;
                    default:
                        return false;
                }
            }
        });

        try {
            wm.addView(v, lp);
            bubble = v;
        } catch (Exception ex) {
            stopSelf();
        }
    }

    private void openLavo() {
        Intent i = getPackageManager().getLaunchIntentForPackage(getPackageName());
        if (i != null) {
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
            startActivity(i);
        }
    }

    @Override
    public void onDestroy() {
        if (bubble != null && wm != null) {
            try {
                wm.removeView(bubble);
            } catch (Exception ignored) {
                // already removed
            }
            bubble = null;
        }
        if (Build.VERSION.SDK_INT >= 24) {
            stopForeground(STOP_FOREGROUND_REMOVE);
        } else {
            stopForeground(true);
        }
        super.onDestroy();
    }
}
