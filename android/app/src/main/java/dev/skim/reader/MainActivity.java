package dev.skim.reader;

import android.content.Intent;
import android.os.Bundle;
import android.view.KeyEvent;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(VolumeButtonsPlugin.class);
        registerPlugin(ShareReceiverPlugin.class);
        super.onCreate(savedInstanceState);
        ShareReceiverPlugin.onIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        ShareReceiverPlugin.onIntent(intent);
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        int code = event.getKeyCode();
        boolean isVolumeKey = code == KeyEvent.KEYCODE_VOLUME_UP || code == KeyEvent.KEYCODE_VOLUME_DOWN;

        if (!isVolumeKey || !VolumeButtonsPlugin.enabled) {
            return super.dispatchKeyEvent(event);
        }

        // Fire once per physical press; ignore key-repeat while held and the key-up.
        if (event.getAction() == KeyEvent.ACTION_DOWN && event.getRepeatCount() == 0) {
            String key = code == KeyEvent.KEYCODE_VOLUME_UP ? "AudioVolumeUp" : "AudioVolumeDown";
            forwardKeyToWebView(key);
        }

        // Consumed: the system volume UI does not appear and volume is unchanged.
        return true;
    }

    private void forwardKeyToWebView(String key) {
        if (getBridge() == null) return;
        WebView webView = getBridge().getWebView();
        if (webView == null) return;

        String js = "window.dispatchEvent(new KeyboardEvent('keydown', {key: '" + key + "', bubbles: true, cancelable: true}))";
        webView.post(() -> webView.evaluateJavascript(js, null));
    }
}
