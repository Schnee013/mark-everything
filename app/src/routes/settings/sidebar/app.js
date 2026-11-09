import React from 'react'
import pjson from '../../../../package.json'

import { Section, SectionTitle } from '~co/common/list'

export default function SettingsSidebarApp() {
    return (
        <>
            <Section>
                <SectionTitle>
                    {process.env.ME_LOCAL ? 'ME' : 'Raindrop.io'} {process.env.ME_LOCAL ? (chrome.runtime.getManifest().version_name || chrome.runtime.getManifest().version) : pjson.version}
                </SectionTitle>
            </Section>
        </>
    )
}