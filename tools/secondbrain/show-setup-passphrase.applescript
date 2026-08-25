set secretFile to POSIX file "/Users/konstantin/november/.private/secondbrain/client-secrets.env"
set secretContents to read secretFile as «class utf8»
set setupPassphrase to missing value
set keyPrefix to "LIVESYNC_SETUP_URI_PASSPHRASE="

repeat with secretLine in paragraphs of secretContents
    set lineText to secretLine as text
    if lineText starts with keyPrefix then
        set setupPassphrase to text ((length of keyPrefix) + 1) thru -1 of lineText
        exit repeat
    end if
end repeat

if setupPassphrase is missing value or (length of setupPassphrase) < 32 then
    display alert "SecondBrain" message "Setup URI passphrase не найден." as critical
    error number -128
end if

display dialog "Setup URI passphrase\n\nПерепечатай или скопируй его в поле Passphrase на подключаемом устройстве. Не сохраняй рядом с setup-uri.txt." default answer setupPassphrase buttons {"Закрыть"} default button "Закрыть" with icon caution
