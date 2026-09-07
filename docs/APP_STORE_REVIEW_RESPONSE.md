# Georgia Safe — App Review response

Attach the short screen recording described below and send this text in App Store Connect after build 11 finishes processing.

## Reply to App Review

Hello,

Thank you for the clarification regarding Guideline 5.1.5.

We have updated Georgia Safe in build 11 to make the app's behavior explicit and to remove features that could create a misleading expectation.

Georgia Safe does not dispatch emergency services and does not transmit a user's identity or location to 112. The “Call 112” action only opens a standard telephone call on the user's device. The call is placed and handled by the device and carrier.

The separate trusted-contact action may prepare an SMS addressed to the phone number entered by the user. If the user grants location permission and a position is available, the prepared text contains a map link. The system Messages composer opens and the user must review the recipient and message and tap Send. Georgia Safe does not send this SMS automatically and cannot verify delivery, receipt, reading, or a response. This action sends nothing to 112 or to nearby Georgia Safe users.

We added an End User License Agreement screen with a specific Emergency Services Disclaimer and location/SMS limitations. It is available before login from the first screen, from Profile → Terms of Use, and from the subscription screen. The app also links to Apple's Standard EULA and its Privacy Policy.

We removed the Check-in Timer, which previously described an automatic trusted-contact message, and removed the test “Safety mode” interface. We also updated all related English, Georgian, and Russian text and the iOS location permission description to match the actual behavior.

Because Georgia Safe does not transmit location to an emergency service, there is no emergency-service location-receipt integration to evidence. We respectfully ask that the app be reviewed based on its actual behavior described above. The attached screen recording shows the complete flow without placing a real emergency call.

Review path:

1. Launch Georgia Safe. The first screen states that the 112 action opens a phone call and does not send location to 112.
2. Tap Terms of Use to view the End User License Agreement and Emergency Services Disclaimer.
3. Continue as guest and tap the red SOS button.
4. The safety-actions sheet distinguishes “Call 112” from “Prepare SMS to Trusted Contact” and explains both limitations.
5. The Emergency tab repeats the 112 disclosure below the call button.

Please let us know if any additional clarification is required.

Best regards,

Georgia Safe

## Screen-recording script

Keep the recording under one minute and do not complete a real 112 call.

1. Start on a fresh install at the Welcome screen and pause on the 112 disclosure.
2. Open Terms of Use.
3. Scroll through the Emergency Services Disclaimer, Trusted-contact messages, and Location use sections.
4. Close the terms, continue as guest, and open the red SOS button.
5. Pause so both action descriptions are readable.
6. Close the sheet and open the Emergency tab; show the disclosure below “Call 112.”
7. Open Profile and show that Check-in Timer and Live Activity test/Safety mode are absent.
8. End the recording without tapping “Call 112.”

## Before resubmission

- Confirm build 11 has finished processing and is selected for review.
- Attach the screen recording to the App Review message.
- Confirm the App Store description and screenshots do not claim automatic alerts, nearby-user alerts, emergency dispatch, or location delivery to 112.
- Keep the Privacy Policy URL in App Store Connect identical to the URL used by the app.
- Confirm Apple's Standard EULA remains selected unless a lawyer supplies a complete custom EULA containing Apple's required minimum terms and the developer's legal contact details.
