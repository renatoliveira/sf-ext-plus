// labels for the extension

export default {
    commands: {
        PROMPT_NAME: 'Enter the label name',
        PLACEHOLDER: 'e.g. My_Custom_Label',
        PLACEHOLDER_NAMESPACE: (namespace: string) => { return `Do you want to use the namespace "${namespace}" from your package.json?`; },
        CUSTOM_LABEL_VALUE_PLACEHOLDER: 'e.g. My Custom Label Value',
        SELECT_CATEGORY: 'Select a category for the label',
        SELECT_CATEGORIES: 'Enter new categories for the label (comma-separated) (leave empty to skip)',
        SELECT_CATEGORIES_PLACEHOLDER: 'e.g. My_Custom_Category',
        LABEL_PROTECTED_PROMPT: 'Is the label protected?',
        LABEL_LANGUAGE_PROMPT: 'Enter the label language',
        LABEL_LANGUAGE_PLACEHOLDER: (lang: string) => { return `e.g. ${lang}`; },
        SHORT_DESCRIPTION_PROMPT: 'Enter a short description for the label (leave empty to skip and use the value from the API name',
        SHORT_DESCRIPTION_PLACEHOLDER: 'e.g. My Custom Label Short Description',
        ENTER_LABEL_VALUE: 'Enter the label value',
        LABEL_ALREADY_EXISTS_AS: (proposedLabelName: string, existingLabelName: string) => { return `Label "${proposedLabelName}" already exists as "${existingLabelName}"`; },
        USE_SIMILAR_LABEL: (similarLabelName: string) => { return `Use a similar label "${similarLabelName}"`; },
        USE_EXISTING_LABEL: (name: string) => { return `Use the existing label "${name}"`; },
        LABELS_NOT_FOUND_IN_WORKSPACE: 'No custom label files found in the workspace. Please retrieve it from the org or create one.',
        LABEL_CREATED_WITH_PATH: (fullName: string, path: string) => { return `Label ${fullName} created successfully in ${path}`; },
        CREATE_LABEL_FOR_PROPOSED_VALUE: (proposedLabelValue: string) => { return `Create label for "${proposedLabelValue}"`; },
        CREATE_LABEL_CODE_ACTION_TITLE: 'Create label',
        SELECT_A_CUSTOM_LABEL_FILE: 'Select a custom label file to create the new label'
    },
    warningMessages: {
        NO_WORKSPACE_IS_OPENED: 'No workspace folder is opened',
        FAILED_TO_LOAD_LABELS_AT_PATH: (path: string, err: Error) => { return `Failed to load labels from ${path}: ${err}`; },
        FAILED_TO_PARSE_FILE_AT_PATH: (path: string, err: Error) => { return `Failed to parse label file ${path}: ${err}`; },
    },
    informationMessages: {
        NO_LABEL_FILES_FOUND: 'No label files found',
        NO_LABELS_IN_FILE: (path: string) => { return `No labels found in ${path}`; },
        LOADING_LABELS_FROM_PATH: (labelCount: Number, path: string) => { return `Loading ${labelCount} labels from ${path}`; },
        PARSED_LABELS_FROM_FILE: (labelCount: Number) => { return `Parsed ${labelCount} labels from your custom labels metadata file.`; },
        NO_LABEL_FILE_SELECTED: 'No label file selected. Aborting label creation.'
    },
    misc: {
        YES: 'Yes',
        NO: 'No',
        EMPTY_STRING: '',
        EXTENSION_NAME: 'sf-ext-plus',
        EXTENSION_SOURCE_NAME: 'Salesforce Ext.+',
        LANG_EN_US: 'en_US'
    }
};
