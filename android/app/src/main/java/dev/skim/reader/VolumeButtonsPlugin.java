package dev.skim.reader;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Lets the web app opt in to owning the volume rocker.
 *
 * While enabled, MainActivity swallows VOLUME_UP / VOLUME_DOWN and forwards
 * them to the WebView as synthetic keydown events ("AudioVolumeUp" /
 * "AudioVolumeDown"), which the reader's useHardwareNav hook already handles.
 * While disabled, the rocker changes volume as normal.
 */
@CapacitorPlugin(name = "VolumeButtons")
public class VolumeButtonsPlugin extends Plugin {

    static volatile boolean enabled = false;

    @PluginMethod
    public void setEnabled(PluginCall call) {
        enabled = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        call.resolve();
    }

    @PluginMethod
    public void isEnabled(PluginCall call) {
        com.getcapacitor.JSObject result = new com.getcapacitor.JSObject();
        result.put("enabled", enabled);
        call.resolve(result);
    }
}
