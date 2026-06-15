package il.co.vaadplus;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** JS bridge to enable/disable the location-based auto gate-open. */
@CapacitorPlugin(name = "AutoGate")
public class AutoGatePlugin extends Plugin {

    @PluginMethod
    public void start(PluginCall call) {
        Double lat = call.getDouble("lat");
        Double lng = call.getDouble("lng");
        Integer radius = call.getInt("radius", 100);
        String number = call.getString("number", "");
        if (lat == null || lng == null || number == null || number.isEmpty()) {
            call.reject("missing lat/lng/number");
            return;
        }
        Context ctx = getContext();
        SharedPreferences p = ctx.getSharedPreferences(AutoGateService.PREFS, Context.MODE_PRIVATE);
        p.edit()
                .putBoolean("enabled", true)
                .putLong("lat", Double.doubleToRawLongBits(lat))
                .putLong("lng", Double.doubleToRawLongBits(lng))
                .putInt("radius", radius)
                .putString("number", number)
                .apply();
        Intent svc = new Intent(ctx, AutoGateService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) ctx.startForegroundService(svc);
        else ctx.startService(svc);
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        Context ctx = getContext();
        ctx.getSharedPreferences(AutoGateService.PREFS, Context.MODE_PRIVATE)
                .edit().putBoolean("enabled", false).apply();
        ctx.stopService(new Intent(ctx, AutoGateService.class));
        call.resolve();
    }

    @PluginMethod
    public void isRunning(PluginCall call) {
        boolean enabled = getContext()
                .getSharedPreferences(AutoGateService.PREFS, Context.MODE_PRIVATE)
                .getBoolean("enabled", false);
        JSObject r = new JSObject();
        r.put("enabled", enabled);
        call.resolve(r);
    }

    @PluginMethod
    public void openBatterySettings(PluginCall call) {
        startSettings(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, true);
        call.resolve();
    }

    @PluginMethod
    public void openOverlaySettings(PluginCall call) {
        startSettings(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, true);
        call.resolve();
    }

    private void startSettings(String action, boolean withPackage) {
        try {
            Intent i = withPackage
                    ? new Intent(action, Uri.parse("package:" + getContext().getPackageName()))
                    : new Intent(action);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
        } catch (Exception e) {
            // ignore — device may not support the settings screen
        }
    }
}
