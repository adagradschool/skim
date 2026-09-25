package dev.skim.reader;

import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import android.database.sqlite.SQLiteStatement;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * A thin SQL transport over Android's built-in SQLite. The database file
 * lives in the app's private storage (getDatabasePath), which the WebView's
 * quota manager never touches, so a full disk can no longer evict the
 * library. Schema and all logic live on the web side.
 */
@CapacitorPlugin(name = "Sqlite")
public class SqlitePlugin extends Plugin {

    private static final String DB_NAME = "skim.db";
    private Helper helper;

    private static final class Helper extends SQLiteOpenHelper {
        Helper(android.content.Context ctx) {
            super(ctx, DB_NAME, null, 1);
        }

        @Override
        public void onCreate(SQLiteDatabase db) {
            // Tables are created by the web layer with CREATE TABLE IF NOT EXISTS.
        }

        @Override
        public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
        }

        @Override
        public void onConfigure(SQLiteDatabase db) {
            db.enableWriteAheadLogging();
        }
    }

    private synchronized SQLiteDatabase db() {
        if (helper == null) helper = new Helper(getContext());
        return helper.getWritableDatabase();
    }

    @PluginMethod
    public void run(PluginCall call) {
        String sql = call.getString("sql");
        if (sql == null) {
            call.reject("sql is required");
            return;
        }
        try {
            exec(db(), sql, call.getArray("params"));
            call.resolve();
        } catch (Exception e) {
            call.reject("SQL failed: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void batch(PluginCall call) {
        JSArray statements = call.getArray("statements");
        if (statements == null) {
            call.reject("statements is required");
            return;
        }
        SQLiteDatabase database = db();
        database.beginTransaction();
        try {
            for (int i = 0; i < statements.length(); i++) {
                JSONObject st = statements.getJSONObject(i);
                String sql = st.getString("sql");
                exec(database, sql, st.optJSONArray("params"));
            }
            database.setTransactionSuccessful();
            call.resolve();
        } catch (Exception e) {
            call.reject("Batch failed: " + e.getMessage(), e);
        } finally {
            database.endTransaction();
        }
    }

    @PluginMethod
    public void query(PluginCall call) {
        String sql = call.getString("sql");
        if (sql == null) {
            call.reject("sql is required");
            return;
        }
        JSArray params = call.getArray("params");
        try (Cursor c = db().rawQuery(sql, bindArgs(params))) {
            JSArray rows = new JSArray();
            String[] cols = c.getColumnNames();
            while (c.moveToNext()) {
                JSObject row = new JSObject();
                for (int i = 0; i < cols.length; i++) {
                    switch (c.getType(i)) {
                        case Cursor.FIELD_TYPE_NULL:
                            row.put(cols[i], JSObject.NULL);
                            break;
                        case Cursor.FIELD_TYPE_INTEGER:
                            row.put(cols[i], c.getLong(i));
                            break;
                        case Cursor.FIELD_TYPE_FLOAT:
                            row.put(cols[i], c.getDouble(i));
                            break;
                        default:
                            row.put(cols[i], c.getString(i));
                    }
                }
                rows.put(row);
            }
            JSObject result = new JSObject();
            result.put("rows", rows);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Query failed: " + e.getMessage(), e);
        }
    }

    private static void exec(SQLiteDatabase database, String sql, JSONArray params) throws JSONException {
        SQLiteStatement stmt = database.compileStatement(sql);
        try {
            if (params != null) {
                for (int i = 0; i < params.length(); i++) {
                    Object v = params.get(i);
                    int idx = i + 1;
                    if (v == null || v == JSONObject.NULL) stmt.bindNull(idx);
                    else if (v instanceof Integer || v instanceof Long) stmt.bindLong(idx, ((Number) v).longValue());
                    else if (v instanceof Number) {
                        double d = ((Number) v).doubleValue();
                        if (d == Math.rint(d) && Math.abs(d) < 9.0e15) stmt.bindLong(idx, (long) d);
                        else stmt.bindDouble(idx, d);
                    } else if (v instanceof Boolean) stmt.bindLong(idx, ((Boolean) v) ? 1 : 0);
                    else stmt.bindString(idx, v.toString());
                }
            }
            stmt.execute();
        } finally {
            stmt.close();
        }
    }

    private static String[] bindArgs(JSONArray params) throws JSONException {
        if (params == null) return new String[0];
        String[] out = new String[params.length()];
        for (int i = 0; i < params.length(); i++) {
            Object v = params.get(i);
            out[i] = (v == null || v == JSONObject.NULL) ? null : v.toString();
        }
        return out;
    }
}
