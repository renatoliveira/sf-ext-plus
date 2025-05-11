export async function copyProjectName(settings: { copyProjectNameToPackageJson: boolean; }, packageJsonObject: { name: any; }, sfdxProjectJson: { name: any; }) {
    if (!settings || !settings.copyProjectNameToPackageJson) {
        return;
    }

    if (packageJsonObject.name !== sfdxProjectJson.name) {
        // set the name to the package directory's name
        packageJsonObject.name = sfdxProjectJson.name;
    }
}

export async function copyProjectDescription(settings: { copyProjectDescriptionToPackageJson: boolean; }, packageJsonObj: { description: any; }, defaultPackageDirectory: { versionDescription: any; }) {
    if (!settings || !settings.copyProjectDescriptionToPackageJson) {
        return;
    }

    if (packageJsonObj.description !== defaultPackageDirectory.versionDescription) {
        // set the description to the package directory's description
        packageJsonObj.description = defaultPackageDirectory.versionDescription;
    }
}

export async function copyVersion(settings: { copyVersionToPackageJson: boolean; }, packageJsonObj: { version: string; }, defaultPackageDirectory: { versionNumber: string; }) {
    if (!settings || !settings.copyVersionToPackageJson) {
        return;
    }

    // check if the version is already set to the same value
    if (packageJsonObj.version !== defaultPackageDirectory.versionNumber) {
        // SFDX version number format is typically major.minor.patch.build
        // Parse the version number to extract only major.minor.patch
        const versionFromSfdx = defaultPackageDirectory.versionNumber;
        const versionParts = versionFromSfdx.split('.');

        // Take only the first three parts (major.minor.patch)
        if (versionParts.length >= 3) {
            packageJsonObj.version = versionParts.slice(0, 3).join('.');
        } else {
            throw new Error(`Invalid version number format in sfdx-project.json: ${defaultPackageDirectory.versionNumber}`);
        }
    }
}

export async function setUpInstallationLink(settings: { setUpInstallationLink: boolean; }, sfdxProjectObject: {
    sfdcLoginUrl: string;
    name: any;
    packageAliases: { [key: string]: string }, packageDirectories: Array<{
        default: boolean;
        versionNumber: string
    }>
}, packageJsonObj: {
    salesforce: {
        packageVersionUrl?: string;
    }
}) {
    if (!settings || !settings.setUpInstallationLink || !sfdxProjectObject.name) {
        return;
    }

    // get the highest version of the package
    const packageDirectories = sfdxProjectObject.packageDirectories;
    const defaultApp = packageDirectories.find((packageDirectory) => {
        return packageDirectory.default;
    });

    if (!defaultApp) {
        throw new Error('No default package directory found in sfdx-project.json');
    }

    const defaultAppVersion = defaultApp.versionNumber.split('.').slice(0, 3).join('.');

    const allPackageAliases = Object.keys(sfdxProjectObject.packageAliases).filter((alias) => {
        return alias.startsWith(`${sfdxProjectObject.name}@${defaultAppVersion}`);
    });

    if (allPackageAliases.length === 0) {
        throw new Error(`Package alias not found for package ${sfdxProjectObject}@${defaultAppVersion}`);
    }

    // given that multiple builds might exist for the same package version, get the highest one:
    const sortedPackageAliases = allPackageAliases.sort((a, b) => {
        const versionA = a.split('@')[1].split('-')[0];
        const versionB = b.split('@')[1].split('-')[0];

        return versionA.localeCompare(versionB);
    });

    // get the last one
    const highestVersionAlias = sortedPackageAliases[sortedPackageAliases.length - 1];
    const orgUrlPrefix = sfdxProjectObject.sfdcLoginUrl || 'https://login.salesforce.com';

    // set the installation link
    const installationLink = `${orgUrlPrefix}/packaging/installPackage.apexp?p0=${sfdxProjectObject.packageAliases[highestVersionAlias]}`;

    // set the installation link in the package.json file
    packageJsonObj.salesforce.packageVersionUrl = installationLink;
}