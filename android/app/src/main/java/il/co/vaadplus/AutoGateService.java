package il.co.vaadplus;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.net.Uri;
import android.os.Build;
import android.os.IBinder;
import android.os.Looper;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;

import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationCallback;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationResult;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;

/**
 * Foreground service that watches the phone's location and, when it enters the
 * configured radius of the gate, places a direct call (ACTION_CALL) from the
 * resident's own (already-authorized) number — opening the gate hands-free.
 * Uses a persistent foreground notification so it keeps running with the app
 * closed. Hysteresis (re-arm only after leaving) prevents repeated calls.
 */
public class AutoGateService extends Service {
    public static final String PREFS = "vaadplus_autogate";
    public static final String CH_ID = "vaadplus_autogate_ch";
    private static final int NOTIF_ID = 4711;

    private static final long CALL_COOLDOWN_MS = 60_000L;

    private FusedLocationProviderClient fused;
    private LocationCallback callback;

    @Override
    public void onCreate() {
        super.onCreate();
        fused = LocationServices.getFusedLocationProviderClient(this);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        SharedPreferences p = getSharedPreferences(PREFS, MODE_PRIVATE);
        if (!p.getBoolean("enabled", false)) {
            stopSelf();
            return START_NOT_STICKY;
        }
        startInForeground();
        startLocationUpdates();
        return START_STICKY;
    }

    private void startInForeground() {
        Notification n = buildNotification("מנטר מיקום — השער ייפתח אוטומטית בהגעה");
        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(NOTIF_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
        } else {
            startForeground(NOTIF_ID, n);
        }
    }

    private void startLocationUpdates() {
        if (callback != null) return;
        LocationRequest req = new LocationRequest.Builder(Priority.PRIORITY_BALANCED_POWER_ACCURACY, 8000L)
                .setMinUpdateIntervalMillis(4000L)
                .setMinUpdateDistanceMeters(10f)
                .build();
        callback = new LocationCallback() {
            @Override
            public void onLocationResult(@NonNull LocationResult result) {
                Location loc = result.getLastLocation();
                if (loc != null) evaluate(loc);
            }
        };
        try {
            fused.requestLocationUpdates(req, callback, Looper.getMainLooper());
        } catch (SecurityException e) {
            stopSelf();
        }
    }

    private void evaluate(Location loc) {
        SharedPreferences p = getSharedPreferences(PREFS, MODE_PRIVATE);
        double lat = Double.longBitsToDouble(p.getLong("lat", 0));
        double lng = Double.longBitsToDouble(p.getLong("lng", 0));
        int radius = p.getInt("radius", 100);
        String number = p.getString("number", "");
        if (number.isEmpty() || (lat == 0 && lng == 0)) return;

        float[] dist = new float[1];
        Location.distanceBetween(loc.getLatitude(), loc.getLongitude(), lat, lng, dist);
        float d = dist[0];

        // State persists across service restarts so the OS restarting us while
        // you're home does NOT re-open the gate.
        boolean inside = p.getBoolean("inside", false);

        // First fix after enabling: just record where we are WITHOUT calling, so
        // turning the toggle on while already home never opens the gate. Only a
        // genuine outside→inside arrival later triggers a call.
        if (!p.getBoolean("primed", false)) {
            p.edit().putBoolean("primed", true).putBoolean("inside", d <= radius).apply();
            return;
        }

        if (!inside && d <= radius) {
            p.edit().putBoolean("inside", true).apply();
            long now = System.currentTimeMillis();
            if (now - p.getLong("lastCall", 0) > CALL_COOLDOWN_MS) {
                p.edit().putLong("lastCall", now).apply();
                placeCall(number);
            }
        } else if (inside && d > radius * 1.4f) {
            p.edit().putBoolean("inside", false).apply(); // re-arm after leaving
        }
    }

    private void placeCall(String number) {
        try {
            Intent call = new Intent(Intent.ACTION_CALL, Uri.parse("tel:" + number));
            call.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(call);
        } catch (Exception e) {
            // CALL_PHONE missing or background-activity-start blocked (needs overlay perm)
        }
    }

    private Notification buildNotification(String text) {
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel ch = new NotificationChannel(CH_ID, "פתיחת שער אוטומטית", NotificationManager.IMPORTANCE_LOW);
            nm.createNotificationChannel(ch);
        }
        Intent launch = getPackageManager().getLaunchIntentForPackage(getPackageName());
        PendingIntent pi = PendingIntent.getActivity(
                this, 0, launch,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        return new NotificationCompat.Builder(this, CH_ID)
                .setContentTitle("וועד+ — פתיחת שער אוטומטית")
                .setContentText(text)
                .setSmallIcon(android.R.drawable.ic_menu_mylocation)
                .setOngoing(true)
                .setContentIntent(pi)
                .build();
    }

    @Override
    public void onDestroy() {
        if (callback != null) {
            fused.removeLocationUpdates(callback);
            callback = null;
        }
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
