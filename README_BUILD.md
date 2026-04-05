# Build ProfitTrack → APK / IPA

## Setup iniziale
npm install
npx cap init ProfitTrack com.profittrack.app --web-dir .

## Android (APK)
npx cap add android
npx cap sync android
npx cap open android
# In Android Studio: Build → Generate Signed Bundle/APK

## iOS (IPA) — richiede Mac + Xcode
npx cap add ios
npx cap sync ios
npx cap open ios
# In Xcode: Product → Archive

## Aggiornare dopo modifiche ai file web
npx cap sync