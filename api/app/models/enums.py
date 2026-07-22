from enum import Enum


class OrgType(str, Enum):
    EXPORTER = "EXPORTER"
    BUYER = "BUYER"
    BANK = "BANK"


class KybStatus(str, Enum):
    PENDING = "PENDING"
    CLEAR = "CLEAR"
    REVIEW = "REVIEW"
    BLOCK = "BLOCK"


class UserRole(str, Enum):
    EXPORTER_ADMIN = "EXPORTER_ADMIN"
    DOCS_COMPLIANCE = "DOCS_COMPLIANCE"
    FINANCE = "FINANCE"
    VIEWER = "VIEWER"
    BUYER = "BUYER"
    BANK_REVIEWER = "BANK_REVIEWER"


class UserStatus(str, Enum):
    ACTIVE = "ACTIVE"
    INVITED = "INVITED"


class KybCheckType(str, Enum):
    BUSINESS_REGISTRATION = "BUSINESS_REGISTRATION"
    SANCTIONS_SCREENING = "SANCTIONS_SCREENING"
    BANK_ACCOUNT = "BANK_ACCOUNT"


class KybCheckStatus(str, Enum):
    PASSED = "PASSED"
    PENDING = "PENDING"
    FAILED = "FAILED"


class TradeStatus(str, Enum):
    DRAFT = "DRAFT"
    DOCS_UNDER_REVIEW = "DOCS_UNDER_REVIEW"
    COMPLIANCE_CLEAR = "COMPLIANCE_CLEAR"
    BANK_REVIEW = "BANK_REVIEW"
    ACCEPTED = "ACCEPTED"
    CLOSED = "CLOSED"


class DocumentVerificationStatus(str, Enum):
    UPLOADED = "UPLOADED"
    PENDING = "PENDING"
    VERIFIED = "VERIFIED"


class SanctionsStatus(str, Enum):
    CLEAR = "CLEAR"
    REVIEW = "REVIEW"
    BLOCK = "BLOCK"


class BankReviewResult(str, Enum):
    MATCHES_LC = "MATCHES_LC"
    DISCREPANCY = "DISCREPANCY"
