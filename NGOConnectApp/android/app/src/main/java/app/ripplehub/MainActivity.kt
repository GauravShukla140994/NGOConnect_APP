package app.ripplehub

import android.os.Bundle
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

  /**
   * Returns the name of the main component registered from JavaScript.
   * Must match AppRegistry.registerComponent() call in index.js.
   */
  override fun getMainComponentName(): String = "RippleHub"

  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)

  /**
   * Pass null instead of savedInstanceState to prevent Android from restoring
   * the fragment back stack on activity re-creation (e.g. after the app is
   * killed in the background). react-native-screens explicitly forbids fragment
   * state restoration — ScreenFragment throws IllegalStateException if it
   * detects it is being restored — so we disable it here for the whole activity.
   *
   * See: https://github.com/software-mansion/react-native-screens/issues/17
   */
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(null)
  }
}
